export type Unsubscribe = () => void;

/**
 * Tiny typed pub/sub. Event maps must be `type` aliases (not interfaces), e.g.
 *   type Events = { hit: { key: string } };
 */
export class EventBus<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<(payload: never) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as (payload: never) => void);
    return () => {
      set!.delete(fn as (payload: never) => void);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as (p: E[K]) => void)(payload));
  }
}
