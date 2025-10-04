import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PAPER_ID = 101;
const ERR_CITATION_ALREADY_EXISTS = 103;
const ERR_INVALID_CITATION_WEIGHT = 104;
const ERR_INVALID_TIMESTAMP = 105;
const ERR_AUTHORITY_NOT_VERIFIED = 106;
const ERR_CITATION_LIMIT_EXCEEDED = 108;
const ERR_SELF_CITATION = 110;
const ERR_INVALID_REWARD = 111;

interface Citation {
  citerId: number;
  citedId: number;
  weight: number;
  timestamp: number;
  citerPrincipal: string;
}

interface CitationCount {
  count: number;
}

interface CitationReward {
  totalReward: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CitationManagerMock {
  state: {
    citationCounter: number;
    maxCitationsPerPaper: number;
    authorityContract: string | null;
    citationRewardBase: number;
    citations: Map<number, Citation>;
    paperCitationCount: Map<number, CitationCount>;
    citationRewards: Map<number, CitationReward>;
  } = {
    citationCounter: 0,
    maxCitationsPerPaper: 1000,
    authorityContract: null,
    citationRewardBase: 100,
    citations: new Map(),
    paperCitationCount: new Map(),
    citationRewards: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  reset(): void {
    this.state = {
      citationCounter: 0,
      maxCitationsPerPaper: 1000,
      authorityContract: null,
      citationRewardBase: 100,
      citations: new Map(),
      paperCitationCount: new Map(),
      citationRewards: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxCitations(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_CITATION_WEIGHT };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.maxCitationsPerPaper = newMax;
    return { ok: true, value: true };
  }

  setCitationRewardBase(newReward: number): Result<boolean> {
    if (newReward <= 0) return { ok: false, value: ERR_INVALID_REWARD };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.citationRewardBase = newReward;
    return { ok: true, value: true };
  }

  addCitation(citerId: number, citedId: number, weight: number): Result<number> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (citerId <= 0 || citedId <= 0) return { ok: false, value: ERR_INVALID_PAPER_ID };
    if (citerId === citedId) return { ok: false, value: ERR_SELF_CITATION };
    if (weight <= 0 || weight > 100) return { ok: false, value: ERR_INVALID_CITATION_WEIGHT };
    const currentCount = this.state.paperCitationCount.get(citedId)?.count || 0;
    if (currentCount >= this.state.maxCitationsPerPaper) return { ok: false, value: ERR_CITATION_LIMIT_EXCEEDED };
    const citationId = this.state.citationCounter;
    if (this.state.citations.has(citationId)) return { ok: false, value: ERR_CITATION_ALREADY_EXISTS };

    this.state.citations.set(citationId, { citerId, citedId, weight, timestamp: this.blockHeight, citerPrincipal: this.caller });
    this.state.paperCitationCount.set(citedId, { count: currentCount + 1 });
    const currentReward = this.state.citationRewards.get(citedId)?.totalReward || 0;
    const newReward = weight * this.state.citationRewardBase;
    this.state.citationRewards.set(citedId, { totalReward: currentReward + newReward });
    this.state.citationCounter++;
    return { ok: true, value: citationId };
  }

  removeCitation(citationId: number): Result<boolean> {
    const citation = this.state.citations.get(citationId);
    if (!citation) return { ok: false, value: ERR_CITATION_ALREADY_EXISTS };
    if (citation.citerPrincipal !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };

    const citedId = citation.citedId;
    const currentCount = this.state.paperCitationCount.get(citedId)!.count;
    const currentReward = this.state.citationRewards.get(citedId)!.totalReward;
    const citationWeight = citation.weight;
    this.state.paperCitationCount.set(citedId, { count: currentCount - 1 });
    this.state.citationRewards.set(citedId, { totalReward: currentReward - (citationWeight * this.state.citationRewardBase) });
    this.state.citations.delete(citationId);
    return { ok: true, value: true };
  }

  getCitation(citationId: number): Citation | null {
    return this.state.citations.get(citationId) || null;
  }

  getCitationCount(paperId: number): CitationCount {
    return this.state.paperCitationCount.get(paperId) || { count: 0 };
  }

  getCitationReward(paperId: number): CitationReward {
    return this.state.citationRewards.get(paperId) || { totalReward: 0 };
  }

  getTotalCitations(): Result<number> {
    return { ok: true, value: this.state.citationCounter };
  }
}

describe("CitationManager", () => {
  let contract: CitationManagerMock;

  beforeEach(() => {
    contract = new CitationManagerMock();
    contract.reset();
  });

  it("adds a citation successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addCitation(1, 2, 50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const citation = contract.getCitation(0);
    expect(citation).toEqual({ citerId: 1, citedId: 2, weight: 50, timestamp: 0, citerPrincipal: "ST1TEST" });
    expect(contract.getCitationCount(2)).toEqual({ count: 1 });
    expect(contract.getCitationReward(2)).toEqual({ totalReward: 5000 });
  });

  it("rejects citation without authority contract", () => {
    const result = contract.addCitation(1, 2, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid paper IDs", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addCitation(0, 2, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PAPER_ID);
  });

  it("rejects self-citation", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addCitation(1, 1, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SELF_CITATION);
  });

  it("rejects invalid citation weight", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.addCitation(1, 2, 101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CITATION_WEIGHT);
  });

  it("rejects citation when limit exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxCitationsPerPaper = 1;
    contract.addCitation(1, 2, 50);
    const result = contract.addCitation(3, 2, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CITATION_LIMIT_EXCEEDED);
  });

  it("removes a citation successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCitation(1, 2, 50);
    const result = contract.removeCitation(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getCitation(0)).toBe(null);
    expect(contract.getCitationCount(2)).toEqual({ count: 0 });
    expect(contract.getCitationReward(2)).toEqual({ totalReward: 0 });
  });

  it("rejects removal by non-citer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCitation(1, 2, 50);
    contract.caller = "ST3FAKE";
    const result = contract.removeCitation(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets citation reward base successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setCitationRewardBase(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.citationRewardBase).toBe(200);
    contract.addCitation(1, 2, 50);
    expect(contract.getCitationReward(2)).toEqual({ totalReward: 10000 });
  });

  it("rejects invalid reward base", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setCitationRewardBase(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REWARD);
  });

  it("returns total citations correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.addCitation(1, 2, 50);
    contract.addCitation(3, 4, 75);
    const result = contract.getTotalCitations();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});