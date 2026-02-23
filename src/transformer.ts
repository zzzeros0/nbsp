import type { BindedType, DataValue, DomainObject } from "./type.js";

export type Transformer<T, R> = (data: T) => R;

export interface PropertyTransformer {
  readonly input?: Transformer<any, any>[];
  readonly output?: Transformer<any, any>[];
}
export type Transformers<T extends DomainObject> = Partial<{
  [K in keyof T]: PropertyTransformer;
}>;

export type ApplyTransformers<
  T extends DomainObject,
  B extends BindedType<T>,
  TR extends Partial<Transformers<T>> | undefined,
> = {
  [K in keyof T]: TR extends undefined
    ? B[K]
    : K extends keyof TR
      ? T[K]
      : B[K];
};

function transform(v: any, transformers: Transformer<any, any>[]): DataValue {
  let rv = v;
  for (const t of transformers) {
    rv = t(rv);
  }
  return rv;
}
export function applyTransform(
  transformer: Transformer<any, any>[] | undefined,
  v: any,
) {
  return transformer && transformer.length ? transform(v, transformer) : v;
}
