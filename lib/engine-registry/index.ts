/**
 * U1 — Engine Registry barrel export
 */

export {
  PRODUCER_IDS,
  type ProducerId,
  type ProducerType,
  type ProducerMetadata,
  PRODUCER_REGISTRY,
  getProducer,
  getActiveProducers,
  getHeldProducers,
  isCanonicalProducerId,
} from './producer-registry';

export {
  resolveCanonicalProducerId,
  isLegacyEngineId,
  getLegacyIdsForProducer,
  getFullCompatibilityMap,
} from './producer-id-compatibility';
