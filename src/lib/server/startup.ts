import { db } from './db';
import { websites, deployments } from './db/schema';
import { eq } from 'drizzle-orm';
import { HostingStorage } from './hosting/storage';
import { Deployer } from './hosting/deployer';
import { logAudit, AuditAction } from './services/audit.service';
import { startAnalyticsRetention } from './services/analytics.service';

let startupRan = false;

export async function runStartupRecovery(): Promise<void> {
	if (startupRan) return;
	startupRan = true;

	startAnalyticsRetention();

	try {
		await recoverBuildingWebsites();
		await verifyActiveWebsites();
	} catch (err) {
		console.error('[startup] Recovery failed:', err);
	}
}

async function recoverBuildingWebsites(): Promise<void> {
	const stuck = await db
		.select()
		.from(websites)
		.where(eq(websites.status, 'BUILDING'));

	if (stuck.length === 0) return;

	console.log(`[startup] Resetting ${stuck.length} stuck BUILDING website(s)...`);

	for (const site of stuck) {
		await db
			.update(websites)
			.set({ status: 'FAILED', updatedAt: new Date() })
			.where(eq(websites.id, site.id));

		await db.insert(deployments).values({
			websiteId: site.id,
			success: false,
			log: 'Reset from BUILDING to FAILED after server restart',
			errorMessage: 'Server was restarted during deployment'
		});

		console.log(`[startup] Reset "${site.name}" (${site.slug}) to FAILED`);
	}
}

async function verifyActiveWebsites(): Promise<void> {
	const active = await db
		.select()
		.from(websites)
		.where(eq(websites.status, 'ACTIVE'));

	if (active.length === 0) return;

	const storage = new HostingStorage();
	const needRedeploy: typeof active = [];

	for (const site of active) {
		const currentPath = storage.getCurrentPath(site.id);
		const exists = await storage.fileExists(currentPath);

		if (!exists) {
			needRedeploy.push(site);
			console.log(`[startup] "${site.name}" (${site.slug}) missing files — will redeploy`);
		}
	}

	if (needRedeploy.length === 0) {
		console.log(`[startup] All ${active.length} active website(s) verified on disk`);
		return;
	}

	const deployer = new Deployer();

	for (const site of needRedeploy) {
		try {
			console.log(`[startup] Redeploying "${site.name}" from ${site.gitUrl}...`);

			await db
				.update(websites)
				.set({ status: 'BUILDING', updatedAt: new Date() })
				.where(eq(websites.id, site.id));

			const result = await deployer.deploy(site.id, site.gitUrl);

			if (result.success) {
				const bytes = await storage.getDirectorySize(storage.getCurrentPath(site.id));
				await db
					.update(websites)
					.set({ status: 'ACTIVE', storageBytes: bytes, updatedAt: new Date() })
					.where(eq(websites.id, site.id));

				await db.insert(deployments).values({
					websiteId: site.id,
					success: true,
					log: `[startup recovery] ${result.log}`
				});

				console.log(`[startup] "${site.name}" redeployed successfully`);
			} else {
				await db
					.update(websites)
					.set({ status: 'FAILED', updatedAt: new Date() })
					.where(eq(websites.id, site.id));

				await db.insert(deployments).values({
					websiteId: site.id,
					success: false,
					log: `[startup recovery] ${result.log}`,
					errorMessage: result.error
				});

				console.log(`[startup] "${site.name}" redeploy failed: ${result.error}`);
			}
		} catch (err) {
			console.error(`[startup] Error redeploying "${site.name}":`, err);

			try {
				await db
					.update(websites)
					.set({ status: 'FAILED', updatedAt: new Date() })
					.where(eq(websites.id, site.id));
			} catch {
				// Best effort
			}
		}
	}
}
