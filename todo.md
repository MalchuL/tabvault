- [x] Fix check connection toast (it's not showing if it's okay)
- [x] Fix refreshing tabs, groups and merge with existing inside extension and server. Add buttons to extensions to refresh and setting for automatic refresh after some time
- [x] Add \* to CORS by default (with warning when server starts)
- [x] Add button to clear all data from the server or extension

# Backend

- [x] When tab is created and group is selected via API, after creation group become null
- [x] Replace to a sqlite database and sqlalchemy with advanced-alchemy for better performance and security
- [x] Store somewhere instant previews.
- [x] Store images, icons inside folders and ignore errors if they are not found and place some mock images. icons, images must return from the server.
- [x] Make tests to cover all cases inside backend
- Add docstrings and normal types.

# UI

- [x] Inside UI when we open single group we should see buttons that corresponds to openall, share, delete.
- [x] Empty groups mustn't be hidden if they are empty
- Add for each group empty item where we can drag and drop items. This will avoid many redrawings. After moving item new space must be created. Currently empty space is not used

# Extension

- [x] Use chrome selection button must be at middle, under "All" button.
- [x] Instead of button "Save selected" button pressing to left, right, all or selected must be without this approve button.
- [x] Near to left, right, all, selected in current must be value in curly braces be number of tabs.
