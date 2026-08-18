import { DirectDeliveryStrategy } from "./strategies/direct-delivery-strategy.js";

const deliveryStrategyByKind = {
  direct: new DirectDeliveryStrategy()
};

const defaultDeliveryStrategyKind = "direct";

export function createDeliveryStrategyRegistry() {
  const strategies = createStrategyMap(deliveryStrategyByKind);

  const getStrategy = (kind) => {
    const strategy = strategies.get(kind);

    if (!strategy) {
      throw new RangeError("unknown_delivery_strategy");
    }

    return strategy;
  };

  return {
    list() {
      return [...strategies.values()].map(toStrategySummary);
    },

    has(kind) {
      return strategies.has(kind);
    },

    get: getStrategy,

    getDefault() {
      return getStrategy(defaultDeliveryStrategyKind);
    }
  };
}

function createStrategyMap(strategyByKind) {
  for (const [kind, strategy] of Object.entries(strategyByKind)) {
    if (strategy.kind !== kind) {
      throw new Error(`strategy kind mismatch: ${kind}`);
    }
  }

  return new Map(Object.entries(strategyByKind));
}

function toStrategySummary(strategy) {
  return {
    kind: strategy.kind,
    label: strategy.label,
    defaultConfig: strategy.defaultConfig ?? {}
  };
}
