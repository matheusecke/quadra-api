# Statistics module

Internal, Prisma-independent calculations shared by athlete and tournament
reads. `StatisticsService` accepts plain nullable box-score values and owns
totals, metric-specific denominators, per-game values, shooting percentages,
TS%, per-match EFF aggregation, and deterministic top-five ordering.

The module has no controller, database query, cache, persistence, or write
behavior. `AthletesModule` and `TournamentsModule` retain tenant-scoped query
and HTTP ownership. Only `FINISHED` filtering happens in those callers.
