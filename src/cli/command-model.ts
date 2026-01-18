import type { PlannedOperation } from "./naming.ts";

export type CommandAction = {
	action: string;
	// Derived path arguments. These become positionals later.
	pathArgs: string[];
	method: string;
	path: string;
	operationId?: string;
	tags: string[];
	summary?: string;
	description?: string;
	deprecated?: boolean;
	style: PlannedOperation["style"];
};

export type CommandResource = {
	resource: string;
	actions: CommandAction[];
};

export type CommandModel = {
	resources: CommandResource[];
};

export function buildCommandModel(planned: PlannedOperation[]): CommandModel {
	const byResource = new Map<string, CommandAction[]>();

	for (const op of planned) {
		const list = byResource.get(op.resource) ?? [];
		list.push({
			action: op.action,
			pathArgs: op.pathArgs,
			method: op.method,
			path: op.path,
			operationId: op.operationId,
			tags: op.tags,
			summary: op.summary,
			description: op.description,
			deprecated: op.deprecated,
			style: op.style,
		});
		byResource.set(op.resource, list);
	}

	const resources: CommandResource[] = [];

	for (const [resource, actions] of byResource.entries()) {
		actions.sort((a, b) => {
			if (a.action !== b.action) return a.action.localeCompare(b.action);
			if (a.path !== b.path) return a.path.localeCompare(b.path);
			return a.method.localeCompare(b.method);
		});
		resources.push({ resource, actions });
	}

	resources.sort((a, b) => a.resource.localeCompare(b.resource));

	return { resources };
}
