# Data deduplicator

`@repo/data-deduplicator` owns duplicate identity, source precedence, and
duplicate planning for every importer. Provider packages decide when to invoke
it and generic database persistence applies the returned row IDs.

Its automatic rules are intentionally conservative: signed values preserve
reversals, provider duplicates require an exact fingerprint, and cross-source
matches require the same account, canonical symbol, date, amount, absolute
units, and currency. Source precedence is SnapTrade, Questrade statements,
then Questrade Legacy. Security grouping and deterministic keeper selection
also live here; importers retain only the persistence steps needed to relink
foreign keys.

For existing stored transactions:

```sh
pnpm data:deduplicate-existing
pnpm data:deduplicate-existing -- --apply
```

The default is a read-only preview. The apply form archives duplicate rows; it
does not delete them.
