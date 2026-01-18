import type { CommandAction, CommandModel } from "./command-model.ts";

export type CommandsIndex = {
	byId: Record<string, CommandAction>;
};

export function buildCommandsIndex(
	commands: CommandModel | undefined,
): CommandsIndex {
	const byId: Record<string, CommandAction> = {};

	for (const resource of commands?.resources ?? []) {
		for (const action of resource.actions) {
			byId[action.id] = action;
		}
	}

	return { byId };
}
