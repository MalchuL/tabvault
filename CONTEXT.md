# TabVault Library

TabVault organizes saved browser tabs while controlling when sensitive browsing context is exposed.

## Language

**Group**:
A named, flat collection of saved tabs. A group has an open-ended category that clients use to
interpret its purpose.
_Avoid_: Folder

**Session Group**:
A group created by a browser capture action, named `Session MMM DD HH:mm` in browser-local time and
assigned the `session` category. It contains saved occurrences captured together until a client
explicitly reclassifies the group as part of editing it.
_Avoid_: Inbox, temporary group

**Manual Group**:
A group created or explicitly reclassified with the `manual` category by a human or agent client.
_Avoid_: Processed group

**Group Category**:
An open-ended string that clients use to interpret a group's purpose. `session` and `manual` are
current conventions, not an exhaustive enumeration.
_Avoid_: Group type, fixed category enum

**Saved Tab**:
The record of one save occurrence. Several saved tabs may have the same saved URL while retaining
distinct identities and metadata.
_Avoid_: Canonical URL record, group membership

**Custom Property Schema**:
The project-scoped definition of the custom properties available to Saved Tabs, including each
property's name, value type, and default value. Clients assign application meaning to properties;
until Projects exist, one schema applies to the Library. Property names are stable, case-sensitive
identities, and definition order has no domain meaning.
_Avoid_: JSON Schema, project settings, tab settings, arbitrary parameters

**Custom Property Value**:
A value explicitly assigned to one custom property on one Saved Tab. A Saved Tab without an
explicit value resolves that property according to its Custom Property Schema.
_Avoid_: Setting, schema entry, built-in field

**Undeclared Property Value**:
A stored property value whose name is absent from the current Custom Property Schema. It is omitted
from resolved Saved Tabs until an explicit repair removes it or the schema declares it again.
_Avoid_: Returned custom property, automatically deleted value

**Custom Property Repair**:
An explicit Library-wide operation that losslessly converts incompatible Custom Property Values
when possible and removes undeclared or unconvertible values so schema defaults apply.
_Avoid_: Validation, read-time normalization, automatic migration

**Saved URL**:
The original URL retained for a saved occurrence, including its query parameters, order, fragment,
encoding, trailing slash, and casing. TabVault does not maintain a separate canonical or normalized
URL.
_Avoid_: Canonical URL, normalized URL

**Duplicate Cluster**:
A set of saved tabs selected for reduction because a client considers their saved content
equivalent. Quick Clean groups by a transient hash of saved URL, title, note, and agent review.
_Avoid_: Canonical tab, shared tab

**Group Membership**:
The optional placement of a saved tab in one group. Moving a saved tab replaces this membership;
saving the same URL in another group creates another saved tab.
_Avoid_: Tab duplicate

**Archived Tab**:
A saved tab removed from ordinary active views while retaining its identity and lifecycle history.
It is Unassigned, but an Unassigned saved tab is not necessarily archived.
_Avoid_: Deleted tab

**Unassigned**:
The absence of group membership, represented by a null group identity and presented by clients as a
virtual collection when nonempty. Both active and archived tabs may be Unassigned.
_Avoid_: Calling it a “null group”, Inbox, persisted group

**Hidden Group**:
A nonempty group whose saved tabs are all under active visibility embargoes. This is a derived
presentation state; groups have no independent visibility embargo and empty groups remain visible.
_Avoid_: Invisible group, archived group

**Visibility Embargo**:
A temporary period stored on a saved tab during which it is omitted from ordinary lists, search,
counts, and exports. Human clients manage it through a dedicated Hidden view; MCP exposes no hidden
content, including direct access by a known identity.
_Avoid_: Access control, permission, archive

**Agent Client**:
An automated client that can organize active, visible tabs through MCP. It selects its own work and
does not receive server-managed assignments, claims, or concurrency guarantees; archived and
hidden content is outside its interface.
_Avoid_: Worker, assignee

**Agent Review**:
Mutable free-form text on a saved tab that an agent may replace or append to. Agents interpret it
themselves when deciding whether a saved tab needs processing, and it persists until explicitly
patched.
_Avoid_: Processing run, review history, work status
