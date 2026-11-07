import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { deployments } from '../db/schema';

export interface DeploymentMeta {
	kind?: 'deploy' | 'rollback' | 'recovery';
	release?: string | null;
	commitSha?: string | null;
	commitMessage?: string | null;
	auditScore?: number | null;
	auditIssues?: string | null;
}

export async function createDeployment(
	websiteId: string,
	deployedBy: string,
	success: boolean,
	log: string,
	errorMessage?: string,
	meta: DeploymentMeta = {}
) {
	const [deployment] = await db
		.insert(deployments)
		.values({
			websiteId,
			deployedBy,
			success,
			log,
			errorMessage: errorMessage ?? null,
			kind: meta.kind ?? 'deploy',
			release: meta.release ?? null,
			commitSha: meta.commitSha ?? null,
			commitMessage: meta.commitMessage ? meta.commitMessage.slice(0, 255) : null,
			auditScore: meta.auditScore ?? null,
			auditIssues: meta.auditIssues ?? null
		})
		.returning();
	return deployment;
}

export async function getDeploymentsByWebsite(websiteId: string) {
	return db
		.select()
		.from(deployments)
		.where(eq(deployments.websiteId, websiteId))
		.orderBy(desc(deployments.createdAt));
}

export async function getLatestDeployment(websiteId: string) {
	const [deployment] = await db
		.select()
		.from(deployments)
		.where(eq(deployments.websiteId, websiteId))
		.orderBy(desc(deployments.createdAt))
		.limit(1);
	return deployment ?? null;
}
