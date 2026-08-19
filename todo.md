- [x] Fix check connection toast (it's not showing if it's okay)
- [x] Fix refreshing tabs, groups and merge with existing inside extension and server. Add buttons to extensions to refresh and setting for automatic refresh after some time
- [x] Add \* to CORS by default (with warning when server starts)
- [x] Add button to clear all data from the server or extension

- When tab is created and group is selected via API, after creation group become null
- Empty groups mustn't be hidden if they are empty
- Replace to a sqlite database and sqlalchemy with advanced-alchemy for better performance and security
- Store somewhere instant previews.
- Store images, icons inside folders and ignore errors if they are not found and place some mock images. icons, images must return from the server.