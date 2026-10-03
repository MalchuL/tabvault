# Custom properties use schema-driven resolution

TabVault stores one Custom Property Schema for the Library in a separate schema record and stores
explicit Custom Property Values as a JSON object on each Saved Tab. Reads resolve missing or invalid
declared values to their schema defaults and omit undeclared stored values without mutating storage;
partial writes validate supplied properties atomically, while explicit validation and repair
operations expose and correct incompatible storage. This avoids an entity-attribute-value model and
bulk default materialization while preserving a future path from one Library schema to one schema
per Project.
