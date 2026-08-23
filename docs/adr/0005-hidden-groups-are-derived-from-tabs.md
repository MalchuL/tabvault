# Hidden groups are derived from their tabs

Only Saved Tabs carry `hiddenUntil`; Groups have no independent hidden field. A nonempty Group is
presented as hidden when every tab it contains is currently hidden, while an empty Group remains
visible. This keeps embargo lifecycle on one entity and lets the UI derive grouped Hidden and All
Tabs views without duplicating state.
