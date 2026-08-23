# Deleting a group archives its tabs

Deleting a Group atomically archives and unassigns every Saved Tab currently in it, then permanently
deletes the Group. Empty Groups are otherwise retained, and manually moving or archiving the last
tab never deletes its Group. This makes Group deletion an explicit removal from the visible library
without destroying saved occurrences.
