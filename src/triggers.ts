export type SequenceTriggerEvent = 'hover' | 'focus' | 'click';

/** Actions are host-owned commands, independent of the playhead and active step. */
export type SequenceTrigger<Id extends string = string, Action = unknown> = {
  id: Id;
  events: readonly SequenceTriggerEvent[];
  actions: readonly Action[];
};

export type SequenceTriggerContext<Trigger extends SequenceTrigger = SequenceTrigger> = {
  trigger: Trigger;
  event: SequenceTriggerEvent | 'manual';
};

export type SequenceTriggerController<Id extends string = string> = {
  /** Dispatches synchronously in authored order. A filtered event returns false. */
  trigger: (id: Id, event?: SequenceTriggerEvent) => boolean;
};

export function defineSequenceTriggers<const Triggers extends readonly SequenceTrigger[]>(
  triggers: Triggers
): Triggers {
  return triggers;
}

export function createSequenceTriggerController<Trigger extends SequenceTrigger>(options: {
  triggers: readonly Trigger[];
  onAction: (action: Trigger['actions'][number], context: SequenceTriggerContext<Trigger>) => void;
}): SequenceTriggerController<Trigger['id']> {
  const byId = new Map<string, Trigger>();
  for (const trigger of options.triggers) {
    if (!trigger.id.trim()) throw new Error('Sequence trigger ids must not be empty.');
    if (byId.has(trigger.id)) throw new Error('Duplicate sequence trigger "' + trigger.id + '".');
    byId.set(trigger.id, trigger);
  }

  return {
    trigger: (id, event) => {
      const trigger = byId.get(id);
      if (!trigger) throw new Error('Unknown sequence trigger "' + id + '".');
      if (event && !trigger.events.includes(event)) return false;
      const context = { trigger, event: event ?? ('manual' as const) };
      for (const action of trigger.actions) options.onAction(action, context);
      return true;
    },
  };
}
