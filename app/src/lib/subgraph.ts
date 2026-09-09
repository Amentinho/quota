import { SUBGRAPH_URL } from "./constants";

export class SubgraphError extends Error {}

export async function querySubgraph<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new SubgraphError("Could not reach the subgraph endpoint. Check your connection.");
  }
  if (!res.ok) {
    throw new SubgraphError(`Subgraph request failed (HTTP ${res.status}).`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new SubgraphError(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data as T;
}

export type Consortium = {
  id: string;
  seasons: Season[];
  participants: Participant[];
};

export type Season = {
  id: string;
  year: string;
  hederaTokenId: string;
  capGrams: string;
  mintedGrams: string;
  retiredGrams: string;
  inCirculationGrams: string;
  utilisationBp: string;
  unauthorizedMints: DetectorFinding[];
  unauthorizedRetirementOutflows: DetectorFinding[];
};

export type Participant = {
  id: string;
  role: string;
  registeredAt: string;
};

export type DetectorFinding = {
  id: string;
  grams: string;
  hederaTxId: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type Lot = {
  id: string;
  season: { id: string; hederaTokenId: string };
  lotRef: string;
  totalRetiredGrams: string;
  mints: { grams: string; hederaTxId: string; blockTimestamp: string; transactionHash: string; to: string }[];
  retirements: { grams: string; hederaTxId: string; blockTimestamp: string; transactionHash: string }[];
  transformationsAsInput: TransformationRef[];
  transformationsAsOutput: TransformationRef[];
};

export type TransformationRef = {
  inputGrams: string;
  outputGrams: string;
  productType: string;
  yieldBp: string;
  blockTimestamp: string;
  transactionHash: string;
};

export type SeasonTransfer = {
  grams: string;
  from: string;
  to: string;
  blockTimestamp: string;
  transactionHash: string;
};

const SOLVENCY_QUERY = `
  query Solvency {
    consortiums(first: 25) {
      id
      seasons {
        id
        year
        hederaTokenId
        capGrams
        mintedGrams
        retiredGrams
        inCirculationGrams
        utilisationBp
        unauthorizedMints(orderBy: blockTimestamp, orderDirection: desc) {
          id
          grams
          hederaTxId
          blockTimestamp
          transactionHash
        }
        unauthorizedRetirementOutflows(orderBy: blockTimestamp, orderDirection: desc) {
          id
          grams
          hederaTxId
          blockTimestamp
          transactionHash
        }
      }
      participants {
        id
        role
        registeredAt
      }
    }
  }
`;

export async function fetchSolvency(): Promise<Consortium[]> {
  const data = await querySubgraph<{ consortiums: Consortium[] }>(SOLVENCY_QUERY);
  return data.consortiums;
}

const LOT_QUERY = `
  query LotJourney($lotRef: String!) {
    lots(where: { lotRef: $lotRef }) {
      id
      season { id hederaTokenId }
      lotRef
      totalRetiredGrams
      mints {
        grams
        hederaTxId
        blockTimestamp
        transactionHash
        to
      }
      retirements {
        grams
        hederaTxId
        blockTimestamp
        transactionHash
      }
      transformationsAsInput {
        inputGrams
        outputGrams
        productType
        yieldBp
        blockTimestamp
        transactionHash
      }
      transformationsAsOutput {
        inputGrams
        outputGrams
        productType
        yieldBp
        blockTimestamp
        transactionHash
      }
    }
  }
`;

export async function fetchLotJourney(lotRef: string): Promise<Lot[]> {
  const data = await querySubgraph<{ lots: Lot[] }>(LOT_QUERY, { lotRef });
  return data.lots;
}

const SEASON_TRANSFERS_QUERY = `
  query SeasonTransfers($seasonId: Bytes!) {
    season(id: $seasonId) {
      transfers(orderBy: blockTimestamp, orderDirection: asc) {
        grams
        from
        to
        blockTimestamp
        transactionHash
      }
    }
  }
`;

export async function fetchSeasonTransfers(seasonId: string): Promise<SeasonTransfer[]> {
  const data = await querySubgraph<{ season: { transfers: SeasonTransfer[] } | null }>(SEASON_TRANSFERS_QUERY, {
    seasonId,
  });
  return data.season?.transfers ?? [];
}

const KNOWN_LOTS_QUERY = `
  query KnownLots {
    lots(first: 50, orderBy: id) {
      lotRef
    }
  }
`;

export async function fetchKnownLotRefs(): Promise<string[]> {
  const data = await querySubgraph<{ lots: { lotRef: string }[] }>(KNOWN_LOTS_QUERY);
  return [...new Set(data.lots.map((l) => l.lotRef))];
}
