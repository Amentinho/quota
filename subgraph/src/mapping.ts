import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  SeasonOpened,
  UnitsMinted,
  Transformed,
  UnitsRetired,
  ParticipantRegistered,
  UnauthorizedMintDetected,
  RetirementOutflowDetected,
} from "../generated/QuotaAnchor/QuotaAnchor";
import {
  Consortium,
  Season,
  Participant,
  Lot,
  Retirement,
  Transformation,
  UnauthorizedMint,
  UnauthorizedRetirementOutflow,
} from "../generated/schema";

const ZERO = BigInt.fromI32(0);
const BP_DENOMINATOR = BigInt.fromI32(10000);

function loadOrCreateConsortium(id: Bytes): void {
  let consortium = Consortium.load(id);
  if (consortium == null) {
    consortium = new Consortium(id);
    consortium.save();
  }
}

// mintedGrams/retiredGrams are updated by the handlers below as events
// arrive; inCirculationGrams/utilisationBp are derived from those two plus
// capGrams every time either changes -- computed here in the mapping, not
// left to query-time aggregation.
function recomputeSeasonAggregates(season: Season): void {
  season.inCirculationGrams = season.mintedGrams.minus(season.retiredGrams);
  if (season.capGrams.gt(ZERO)) {
    season.utilisationBp = season.mintedGrams.times(BP_DENOMINATOR).div(season.capGrams);
  } else {
    season.utilisationBp = ZERO;
  }
}

export function handleSeasonOpened(event: SeasonOpened): void {
  loadOrCreateConsortium(event.params.consortiumId);

  let season = new Season(event.params.seasonId);
  season.consortium = event.params.consortiumId;
  season.year = event.params.year;
  season.hederaTokenId = event.params.hederaTokenId;
  season.ensNode = event.params.ensNode;
  season.capGrams = event.params.capGrams;
  season.mintedGrams = ZERO;
  season.retiredGrams = ZERO;
  recomputeSeasonAggregates(season);
  season.save();
}

export function handleUnitsMinted(event: UnitsMinted): void {
  let season = Season.load(event.params.seasonId);
  if (season == null) {
    log.warning("UnitsMinted for unknown season {}", [event.params.seasonId.toHexString()]);
    return;
  }
  season.mintedGrams = season.mintedGrams.plus(event.params.grams);
  recomputeSeasonAggregates(season);
  season.save();
}

export function handleUnitsRetired(event: UnitsRetired): void {
  let season = Season.load(event.params.seasonId);
  if (season == null) {
    log.warning("UnitsRetired for unknown season {}", [event.params.seasonId.toHexString()]);
    return;
  }
  season.retiredGrams = season.retiredGrams.plus(event.params.grams);
  recomputeSeasonAggregates(season);
  season.save();

  let lotId = event.params.seasonId.toHexString() + "-" + event.params.lotRef;
  let lot = Lot.load(lotId);
  if (lot == null) {
    lot = new Lot(lotId);
    lot.season = event.params.seasonId;
    lot.lotRef = event.params.lotRef;
    lot.totalRetiredGrams = ZERO;
  }
  lot.totalRetiredGrams = lot.totalRetiredGrams.plus(event.params.grams);
  lot.save();

  let retirementId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let retirement = new Retirement(retirementId);
  retirement.season = event.params.seasonId;
  retirement.lot = lotId;
  retirement.grams = event.params.grams;
  retirement.hederaTxId = event.params.hederaTxId;
  retirement.blockTimestamp = event.block.timestamp;
  retirement.transactionHash = event.transaction.hash;
  retirement.save();
}

export function handleTransformed(event: Transformed): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let t = new Transformation(id);
  t.inputSeason = event.params.inputSeasonId;
  t.inputGrams = event.params.inputGrams;
  t.outputSeason = event.params.outputSeasonId;
  t.outputGrams = event.params.outputGrams;
  t.productType = event.params.productType;
  t.yieldBp = event.params.yieldBp;
  t.blockTimestamp = event.block.timestamp;
  t.transactionHash = event.transaction.hash;
  t.save();
}

export function handleParticipantRegistered(event: ParticipantRegistered): void {
  loadOrCreateConsortium(event.params.consortiumId);

  let participant = new Participant(event.params.addr);
  participant.consortium = event.params.consortiumId;
  participant.role = event.params.role;
  participant.registeredAt = event.block.timestamp;
  participant.transactionHash = event.transaction.hash;
  participant.save();
}

// Both handlers below index a finding the off-chain reconciler already
// made -- see CLAUDE.md ("bridging Hedera mirror-node data into the
// subgraph"). This mapping never talks to Hedera; it only ever sees what
// the reconciler chose to anchor.

export function handleUnauthorizedMintDetected(event: UnauthorizedMintDetected): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let u = new UnauthorizedMint(id);
  u.season = event.params.seasonId;
  u.grams = event.params.grams;
  u.hederaTxId = event.params.hederaTxId;
  u.blockTimestamp = event.block.timestamp;
  u.transactionHash = event.transaction.hash;
  u.save();
}

export function handleRetirementOutflowDetected(event: RetirementOutflowDetected): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let u = new UnauthorizedRetirementOutflow(id);
  u.season = event.params.seasonId;
  u.grams = event.params.grams;
  u.hederaTxId = event.params.hederaTxId;
  u.blockTimestamp = event.block.timestamp;
  u.transactionHash = event.transaction.hash;
  u.save();
}
