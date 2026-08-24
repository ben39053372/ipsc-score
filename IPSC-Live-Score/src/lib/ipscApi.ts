import { Platform } from "react-native";

export type MatchListItem = {
    matchId: number;
    href: string;
    name: string;
    date: string;
    club: string;
    level: string;
    updated_at: string;
};

export type StageResult = {
    name: string;
    stage: number;
    factor: string;
    pts: string;
    a: string;
    c: string;
    d: string;
    mi: string;
    ns: string;
    pe: string;
    time: string;
    stagePoint: number;
};

export type ShooterScore = {
    name: string;
    div: string;
    class_name: string;
    cat: string | null;
    totalStagePoint: number;
    dq: boolean;
    rank: number;
    percent: number;
    stageResult: StageResult[];
};

export type ScoreGroup = {
    groupName: string;
    groupResults: ShooterScore[];
};

export const getDefaultBaseUrl = () => {
    if (Platform.OS === "android") {
        return "http://10.0.2.2:8787";
    }
    return "http://localhost:8787";
};

export const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const getApiError = async (response: Response, fallbackMessage: string) => {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? fallbackMessage;
};

export const fetchMatches = async (baseUrl: string): Promise<MatchListItem[]> => {
    const response = await fetch(`${baseUrl}/matches`);
    if (!response.ok) {
        throw new Error(await getApiError(response, `Failed to load matches (${response.status})`));
    }
    return (await response.json()) as MatchListItem[];
};

export const fetchScore = async (baseUrl: string, matchId: number): Promise<ScoreGroup[]> => {
    const response = await fetch(`${baseUrl}/matches/${matchId}/score`);
    if (!response.ok) {
        throw new Error(await getApiError(response, `Failed to load score (${response.status})`));
    }
    return (await response.json()) as ScoreGroup[];
};
