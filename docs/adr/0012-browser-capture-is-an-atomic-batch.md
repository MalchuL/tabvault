# Browser capture is an atomic batch

Browser capture persists its Session Group and all eligible Saved Tab occurrences in one local
storage write, then synchronizes those occurrences through one transactional backend batch. Source
tabs close only after the local batch succeeds; a local failure leaves all sources open. This trades
per-occurrence partial success for substantially lower serialization and request overhead while the
ordinary human and agent mutation APIs remain single-resource operations.
