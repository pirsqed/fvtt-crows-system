const { StringField, HTMLField, NumberField } = foundry.data.fields;

export class BoonDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true, initial: "" }),
      uses: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      sourceName: new StringField({ required: true, blank: true, initial: "" }),
      sourceUuid: new StringField({ required: true, blank: true, initial: "" })
    };
  }
}
