# Groups are flat and openly categorized

Groups form a flat collection with no parent-child relationships. Each Group carries an open-ended
category string that clients interpret by convention, initially using `session` for browser captures
and `manual` for curated organization. Group editors explicitly send `manual` when changing a
Group; changing a tab does not implicitly reclassify its Group. This favors simple human and agent
queries over hierarchical paths, database triggers, or a closed category enumeration.
