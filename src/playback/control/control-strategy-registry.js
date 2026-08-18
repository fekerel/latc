import { UpnpAvTransportControlStrategy } from "./strategies/upnp-avtransport-control-strategy.js";

const controlStrategyByKind = {
  "upnp-avtransport": new UpnpAvTransportControlStrategy()
};

const defaultControlStrategyKind = "upnp-avtransport";

export function createControlStrategyRegistry() {
  const strategies = createStrategyMap(controlStrategyByKind);

  const getStrategy = (kind) => {
    const strategy = strategies.get(kind);

    if (!strategy) {
      throw new RangeError("unknown_control_strategy");
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
      return getStrategy(defaultControlStrategyKind);
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
