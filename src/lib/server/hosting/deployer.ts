import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { HostingStorage } from './storage.js';
import { validateStaticFiles, sanitizeFiles } from './validator.js';
import { normalizeGitUrl } from './git-url.js';
import { auditStaticSite, type SiteAudit } from './audit.js';
import { captureThumbnail } from './thumbnail.js';

const run = promisify(execFile);

export interface DeployResult {
	success: boolean;
	log: string;
	error?: string;
	release?: string;
	commitSha?: string;
	commitMessage?: string;
	audit?: SiteAudit;
	thumbnail?: boolean;
}

async function git(args: string[], cwd?: string): Promise<string> {
	const { stdout } = await run('git', args, {
		cwd,
		timeout: 60000,
		maxBuffer: 10 * 1024 * 1024,
		env: {
			...process.env,
			GIT_TERMINAL_PROMPT: '0',
			GIT_ASKPASS: 'echo',
			GIT_CONFIG_NOSYSTEM: '1'
		}
	});
	return stdout.trim();
}

export class Deployer {
	private storage: HostingStorage;

	constructor() {
		this.storage = new HostingStorage();
	}

	async deploy(websiteId: string, gitUrl: string): Promise<DeployResult> {
		const log: string[] = [];
		let tempDir: string | null = null;

		const logMsg = (msg: string) => {
			log.push(msg);
		};

		try {
			// Validated before it ever reaches a shell: only https:// URLs with a
			// plain host and path are accepted, and git is exec'd with an argv
			// array so nothing in the URL can turn into a command.
			const repoUrl = normalizeGitUrl(gitUrl);
			logMsg(`Fetching ${repoUrl}...`);

			tempDir = await mkdtemp(join(tmpdir(), 'as-hosting-deploy-'));

			await git(['clone', '--depth', '1', '--no-tags', repoUrl, tempDir]);
			logMsg('Repository cloned.');

			const gitDir = join(tempDir, '.git');
			try {
				await stat(gitDir);
			} catch {
				logMsg('Error: .git directory not found after clone.');
				return { success: false, log: log.join('\n'), error: 'Clone failed: .git directory missing' };
			}

			const commitSha = await git(['rev-parse', 'HEAD'], tempDir).catch(() => '');
			const commitMessage = await git(['log', '-1', '--pretty=%s'], tempDir).catch(() => '');
			if (commitSha) logMsg(`Commit ${commitSha.slice(0, 7)}${commitMessage ? `: ${commitMessage}` : ''}`);

			const validation = await validateStaticFiles(tempDir);
			if (!validation.valid) {
				logMsg(`Error: ${validation.error}`);
				return { success: false, log: log.join('\n'), error: validation.error, commitSha, commitMessage };
			}

			logMsg('Checking static files... index.html found.');

			await sanitizeFiles(tempDir);

			await rm(gitDir, { recursive: true, force: true });

			const audit = await auditStaticSite(tempDir).catch(() => null);
			if (audit) {
				logMsg(`Site checks: ${audit.score}/100, ${audit.issues.length} issue(s).`);
				for (const issue of audit.issues.slice(0, 5)) {
					logMsg(`  ${issue.level}: ${issue.message}`);
				}
			}

			logMsg('Publishing website...');
			const release = this.storage.newReleaseName();
			await this.storage.publish(websiteId, tempDir, release);
			logMsg(`Website is live (release ${release}).`);

			await this.storage.pruneReleases(websiteId).catch(() => {});

			const releasePath = this.storage.getReleasePath(websiteId, release);
			const thumbnail = await captureThumbnail(
				releasePath,
				this.storage.getThumbnailPath(websiteId)
			).catch(() => false);
			logMsg(thumbnail ? 'Screenshot captured.' : 'Screenshot skipped.');

			return {
				success: true,
				log: log.join('\n'),
				release,
				commitSha: commitSha || undefined,
				commitMessage: commitMessage || undefined,
				audit: audit ?? undefined,
				thumbnail
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logMsg(`Error: ${message}`);
			return { success: false, log: log.join('\n'), error: message };
		} finally {
			if (tempDir) {
				await rm(tempDir, { recursive: true, force: true }).catch(() => {});
			}
		}
	}
}
