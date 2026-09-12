/**
 * Postgres cannot carry a column's NOT NULL through a view, so every column of a view
 * arrives in the generated types as nullable. This restores the nullability the base
 * table already guarantees, without redeclaring the row shape.
 *
 * Only list keys the schema actually constrains — the point is to state the contract
 * once, not to wish nulls away.
 */
export type Guaranteed<TRow, TKeys extends keyof TRow> = Omit<TRow, TKeys> & {
  [Key in TKeys]: NonNullable<TRow[Key]>;
};

/**
 * The mirror problem. A function's `returns table (...)` carries no nullability at all,
 * so the generator assumes every column is non-null — which is wrong for any column
 * reading an optional field like a quote, a scheduled time or an unrated job.
 *
 * Left uncorrected, `response.display_name.split(' ')` would compile and then crash.
 */
export type Nullable<TRow, TKeys extends keyof TRow> = Omit<TRow, TKeys> & {
  [Key in TKeys]: TRow[Key] | null;
};

/** The row type of an RPC that returns a set. */
export type RpcRow<TReturns> = TReturns extends (infer TRow)[] ? TRow : never;
