import {
	mkdir,
	cp,
	rm,
	stat,
	access,
	readdir,
	lstat,
	rename,
	symlink,
	realpath
} from 'node:fs/promises';
import { join } from 'node:path';

/**
 * On-disk layout for one website:
 *
 *   data/websites/<id>/releases/<release>/   immutable copy of one deploy
 *   data/websites/<id>/current               symlink to releases/<release>
 *   data/websites/<id>/archive/              set aside while archived
 *   data/websites/<id>/thumb.png             deploy screenshot
 *
 * `current` is a symlink so a rollback is a single rename: no copying, and no
 * window where the site is half-swapped while people are loading it.
 */
const KEEP_RELEASES = 5;

function releaseStamp(date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return [
		date.getUTCFullYear(),
		pad(date.getUTCMonth() + 1),
		pad(date.getUTCDate()),
		'-',
		pad(date.getUTCHours()),
		pad(date.getUTCMinutes()),
		pad(date.getUTCSeconds())
	].join('');
}

export class HostingStorage {
	private basePath: string;

	constructor(basePath: string = 'data/websites') {
		this.basePath = basePath;
	}

	getWebsitePath(websiteId: string): string {
		return join(this.basePath, websiteId);
	}

	getCurrentPath(websiteId: string): string {
		return join(this.getWebsitePath(websiteId), 'current');
	}

	getArchivePath(websiteId: string): string {
		return join(this.getWebsitePath(websiteId), 'archive');
	}

	getReleasesPath(websiteId: string): string {
		return join(this.getWebsitePath(websiteId), 'releases');
	}

	getReleasePath(websiteId: string, release: string): string {
		return join(this.getReleasesPath(websiteId), release);
	}

	getThumbnailPath(websiteId: string): string {
		return join(this.getWebsitePath(websiteId), 'thumb.png');
	}

	getServePath(websiteId: string): string {
		return this.getCurrentPath(websiteId);
	}

	newReleaseName(): string {
		return releaseStamp();
	}

	/** Publishes a cloned directory as a new release and points `current` at it. */
	async publish(websiteId: string, sourceDir: string, release?: string): Promise<number> {
		const name = release ?? this.newReleaseName();
		const releasePath = this.getReleasePath(websiteId, name);

		await mkdir(releasePath, { recursive: true });
		await cp(sourceDir, releasePath, { recursive: true, dereference: true });

		await this.activateRelease(websiteId, name);

		return this.getDirectorySize(releasePath);
	}

	/** Newest first. */
	async listReleases(websiteId: string): Promise<string[]> {
		let entries;
		try {
			entries = await readdir(this.getReleasesPath(websiteId), { withFileTypes: true });
		} catch {
			return [];
		}

		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((a, b) => b.localeCompare(a));
	}

	async getActiveRelease(websiteId: string): Promise<string | null> {
		try {
			const info = await lstat(this.getCurrentPath(websiteId));
			if (!info.isSymbolicLink()) return null;
			const target = await realpath(this.getCurrentPath(websiteId));
			return target.split('/').pop() ?? null;
		} catch {
			return null;
		}
	}

	/** Atomically repoints `current` at an existing release. */
	async activateRelease(websiteId: string, release: string): Promise<void> {
		if (!/^[A-Za-z0-9._-]+$/.test(release)) {
			throw new Error('Invalid release name');
		}

		const releasePath = this.getReleasePath(websiteId, release);
		if (!(await this.fileExists(releasePath))) {
			throw new Error(`Release ${release} does not exist`);
		}

		const currentPath = this.getCurrentPath(websiteId);
		const websitePath = this.getWebsitePath(websiteId);
		await mkdir(websitePath, { recursive: true });

		// Older installs keep `current` as a real directory. Adopt whatever is
		// there as a release before switching to the symlink layout, so existing
		// sites stay rollback-able instead of being thrown away.
		let existing: Awaited<ReturnType<typeof lstat>> | null = null;
		try {
			existing = await lstat(currentPath);
		} catch {
			existing = null;
		}

		if (existing && !existing.isSymbolicLink()) {
			const adopted = `adopted-${releaseStamp()}`;
			await rename(currentPath, this.getReleasePath(websiteId, adopted)).catch(async () => {
				await rm(currentPath, { recursive: true, force: true });
			});
		}

		const tempLink = join(websitePath, `.current-${Date.now()}`);
		await symlink(join('releases', release), tempLink);
		await rename(tempLink, currentPath);
	}

	/** Deletes all but the newest `keep` releases, never touching the active one. */
	async pruneReleases(websiteId: string, keep: number = KEEP_RELEASES): Promise<string[]> {
		const releases = await this.listReleases(websiteId);
		const active = await this.getActiveRelease(websiteId);
		const removed: string[] = [];

		for (let index = keep; index < releases.length; index += 1) {
			const release = releases[index];
			if (release === active) continue;
			await rm(this.getReleasePath(websiteId, release), { recursive: true, force: true });
			removed.push(release);
		}

		return removed;
	}

	async archive(websiteId: string): Promise<void> {
		const currentPath = this.getCurrentPath(websiteId);
		const archivePath = this.getArchivePath(websiteId);

		const currentExists = await this.fileExists(currentPath);
		if (!currentExists) return;

		await rm(archivePath, { recursive: true, force: true });
		await mkdir(archivePath, { recursive: true });

		await cp(currentPath, archivePath, { recursive: true, dereference: true });
		await rm(currentPath, { force: true });
	}

	async restore(websiteId: string): Promise<void> {
		const archivePath = this.getArchivePath(websiteId);

		const archiveExists = await this.fileExists(archivePath);
		if (!archiveExists) throw new Error('No archived version found');

		const release = `restored-${releaseStamp()}`;
		const releasePath = this.getReleasePath(websiteId, release);
		await mkdir(releasePath, { recursive: true });
		await cp(archivePath, releasePath, { recursive: true, dereference: true });

		await this.activateRelease(websiteId, release);
		await rm(archivePath, { recursive: true, force: true });
	}

	async remove(websiteId: string): Promise<void> {
		const websitePath = this.getWebsitePath(websiteId);
		await rm(websitePath, { recursive: true, force: true });
	}

	async removeArchived(websiteId: string): Promise<void> {
		const archivePath = this.getArchivePath(websiteId);
		await rm(archivePath, { recursive: true, force: true });
	}

	async getDirectorySize(dirPath: string): Promise<number> {
		let totalSize = 0;

		const entries = await readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dirPath, entry.name);

			if (entry.isDirectory()) {
				totalSize += await this.getDirectorySize(fullPath);
			} else {
				const fileStat = await stat(fullPath);
				totalSize += fileStat.size;
			}
		}

		return totalSize;
	}

	async fileExists(path: string): Promise<boolean> {
		try {
			await access(path);
			return true;
		} catch {
			return false;
		}
	}
}
