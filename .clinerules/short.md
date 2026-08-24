We have certain rules we must always follow:
* All files must be kept shorter than 400 lines.
  * Break up large files you encounter using separation of concerns and the simgle purpose principles.
* All new files must be shorter than 200 lines.
  * Leave room as things will grow in later iterations.
* Before making changes to files, use `wc -l` to confirm the starting file size.
* After making significant changes to files, check their filesize with `wc -l`