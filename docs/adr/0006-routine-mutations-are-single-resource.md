# Routine mutations are single-resource operations

TabVault does not expose generic bulk create, update, hide, or delete operations for routine tab
work. Human and agent clients issue one request per resource and report partial failures when
orchestrating multi-item actions. This avoids coupling unrelated mutations into large failure and
retry boundaries, at the cost of additional requests and intentionally non-atomic UI actions.
Specialized whole-resource operations such as import and Group deletion may remain transactional;
their domain behavior is recorded separately.
