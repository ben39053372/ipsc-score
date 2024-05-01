type PlayerMark = {
  id: number;
  name: string | undefined;
  div: string | undefined;
  class: string | undefined;
  cat: string | undefined;
  score: {
    stage: string | undefined;
    factor: string;
    pts: string;
    a: string;
    c: string;
    d: string;
    mi: string;
    ns: string;
    pe: string;
    time: string;
  }[];
};

type PlayerMarkWithScore = PlayerMark & {
  totalScore: number;
  score: {
    stage: string | undefined;
    factor: string;
    pts: string;
    a: string;
    c: string;
    d: string;
    mi: string;
    ns: string;
    pe: string;
    time: string;
    totalScore: number;
    scorePercentage: number;
  }[];
};
