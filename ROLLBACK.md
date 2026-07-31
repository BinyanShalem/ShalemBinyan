# Blue frontend rollback

The production design that was live immediately before the blue frontend launch is preserved in the remote branch:

`backup/pre-blue-redesign-2026-07-30`

It points to commit:

`15b25ec7ebe32e1016a82c763bb49675b59a7bf4`

Do not merge the backup branch into `main`: because it is an ancestor of the redesign, Git would report that there is nothing new to merge.

## Restore the previous design

1. Update the local `main` branch:

   ```sh
   git switch main
   git pull --ff-only
   ```

2. Find the cutover commit:

   ```sh
   git log --oneline --grep="Launch calm-blue frontend"
   ```

3. Revert that commit, replacing `<cutover-commit>` with the hash shown by the previous command:

   ```sh
   git revert <cutover-commit>
   git push origin main
   ```

GitHub Pages will then publish the restored design from `main`. Keep the backup branch when cleaning up feature branches; it is the permanent reference copy of the old site.
