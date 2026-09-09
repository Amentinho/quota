import { BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  SeasonOpened,
  UnitsMinted,
  UnitsTransferred,
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
  Mint,
  Transfer,
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

// Lot identity is (seasonId, lotRef) -- the same lotRef string in a
// different season (e.g. the output product a lot becomes after
// transformation) is a different Lot entity, linked via
// Transformation.inputLot/outputLot. lotRef is assigned at mint time, so a
// Lot can be created here before any retirement ever touches it.
function loadOrCreateLot(seasonId: Bytes, lotRef: string): Lot {
  let lotId = seasonId.toHexString() + "-" + lotRef;
  let lot = Lot.load(lotId);
  if (lot == null) {
    lot = new Lot(lotId);
    lot.season = seasonId;
    lot.lotRef = lotRef;
    lot.totalRetiredGrams = ZERO;
    lot.save();
  }
  return lot as Lot;
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

  let lot = loadOrCreateLot(event.params.seasonId, event.params.lotRef);

  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let mint = new Mint(id);
  mint.season = event.params.seasonId;
  mint.lot = lot.id;
  mint.to = event.params.to;
  mint.grams = event.params.grams;
  mint.hederaTxId = event.params.hederaTxId;
  mint.blockTimestamp = event.block.timestamp;
  mint.transactionHash = event.transaction.hash;
  mint.save();
}

// Not lot-attributed at the contract level -- see schema.graphql's note on
// Transfer -- so this just indexes the season-scoped custody change.
export function handleUnitsTransferred(event: UnitsTransferred): void {
  let season = Season.load(event.params.seasonId);
  if (season == null) {
    log.warning("UnitsTransferred for unknown season {}", [event.params.seasonId.toHexString()]);
    return;
  }

  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let transfer = new Transfer(id);
  transfer.season = event.params.seasonId;
  transfer.from = event.params.from;
  transfer.to = event.params.to;
  transfer.grams = event.params.grams;
  transfer.blockTimestamp = event.block.timestamp;
  transfer.transactionHash = event.transaction.hash;
  transfer.save();
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

  let lot = loadOrCreateLot(event.params.seasonId, event.params.lotRef);
  lot.totalRetiredGrams = lot.totalRetiredGrams.plus(event.params.grams);
  lot.save();

  let retirementId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let retirement = new Retirement(retirementId);
  retirement.season = event.params.seasonId;
  retirement.lot = lot.id;
  retirement.grams = event.params.grams;
  retirement.hederaTxId = event.params.hederaTxId;
  retirement.blockTimestamp = event.block.timestamp;
  retirement.transactionHash = event.transaction.hash;
  retirement.save();
}

// inputLot and outputLot are two DIFFERENT Lot entities (different
// seasons, same lotRef string) -- this is where a lot's identity crosses
// from the input product's season into the output product's season.
// yieldBp is always what the contract read live from ENS and enforced as
// a ceiling, never caller-supplied -- see QuotaAnchor.recordTransform.
export function handleTransformed(event: Transformed): void {
  let inputLot = loadOrCreateLot(event.params.inputSeasonId, event.params.lotRef);
  let outputLot = loadOrCreateLot(event.params.outputSeasonId, event.params.lotRef);

  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let t = new Transformation(id);
  t.inputSeason = event.params.inputSeasonId;
  t.inputLot = inputLot.id;
  t.inputGrams = event.params.inputGrams;
  t.outputSeason = event.params.outputSeasonId;
  t.outputLot = outputLot.id;
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
