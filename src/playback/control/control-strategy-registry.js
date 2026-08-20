import { UpnpAvTransportControlStrategy } from "./strategies/upnp-avtransport-control-strategy.js";

const controlStrategyClasses = [
  UpnpAvTransportControlStrategy
];

const DefaultControlStrategy = UpnpAvTransportControlStrategy;

export function createControlStrategyRegistry(deps = {}) {
  const strategyFactories = createStrategyFactoryMap(
    controlStrategyClasses,
    deps
  );

  const getStrategyFactory = (kind) => {
    const factory = strategyFactories.get(kind);

    if (!factory) {
      throw new RangeError("unknown_control_strategy");
    }

    return factory;
  };
  const getDefinition = (kind) => toStrategyDefinition(getStrategyFactory(kind));

  return {
    list() {
      return [...strategyFactories.values()].map(toStrategyDefinition);
    },

    has(kind) {
      return strategyFactories.has(kind);
    },

    getDefinition,

    getDefault() {
      return getDefinition(DefaultControlStrategy.kind);
    },

    create(kind, config = {}) {
      return getStrategyFactory(kind)(config);
    }
  };
}

function createStrategyFactory(Strategy, deps) {
  const factory = (config) => new Strategy(config, deps);

  factory.kind = Strategy.kind;
  factory.label = Strategy.label;
  factory.defaultConfig = Strategy.defaultConfig ?? {};

  return factory;
}

function createStrategyFactoryMap(StrategyClasses, deps) {
  const strategyFactories = new Map();

  for (const Strategy of StrategyClasses) {
    if (!Strategy.kind) {
      throw new TypeError("strategy kind is required");
    }

    if (strategyFactories.has(Strategy.kind)) {
      throw new Error(`duplicate strategy kind: ${Strategy.kind}`);
    }

    strategyFactories.set(Strategy.kind, createStrategyFactory(Strategy, deps));
  }

  return strategyFactories;
}

function toStrategyDefinition(factory) {
  return {
    kind: factory.kind,
    label: factory.label,
    defaultConfig: factory.defaultConfig ?? {}
  };
}
