import type { TStatsType } from "../character/BaseCharacter.ts";

export type SavingThrowRequest = {
	targetId: string;
	ability: TStatsType;
	dc: number;
	source: string;
	voluntaryFailure?: boolean;
	advantage?: boolean;
	disadvantage?: boolean;
	bonus?: number;
};
export type SavingThrowResult = {
	targetId: string;
	ability: TStatsType;
	dc: number;
	source: string;
	d20Rolls: readonly number[];
	natural: number | null;
	bonus: number;
	total: number | null;
	success: boolean;
	outcome: "rolled" | "automatic-failure" | "voluntary-failure";
};
