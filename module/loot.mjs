/**
 * Crows Physical Canvas Ground Loot & Container Engine
 */
export class CrowsLoot {
  /**
   * Hook handler for when drag-and-drop data is dropped onto the canvas
   */
  static async onDropCanvasData(canvas, data) {
    if (data.type !== "Item") return true;

    // Retrieve dropped item data
    let item;
    try {
      item = await Item.implementation.fromDropData(data);
    } catch (err) {
      console.warn("Crows | Could not resolve item from drop data", err);
      return true;
    }
    if (!item) return true;

    const itemData = item.toObject();
    const sourceActor = item.actor;

    // Calculate grid coordinates
    const grid = canvas.grid;
    let [x, y] = [data.x, data.y];
    if (grid) {
      const snapped = grid.getSnappedPosition(x - (grid.size / 2), y - (grid.size / 2), 1);
      x = snapped.x;
      y = snapped.y;
    }

    // Create a physical Item Token on the canvas
    await CrowsLoot.createItemTokenOnCanvas(itemData, { x, y, scene: canvas.scene });

    // If dropped from a character sheet, remove it from the actor's inventory
    if (sourceActor && sourceActor.isOwner) {
      await item.delete();
      ui.notifications.info(`Dropped ${item.name} onto the ground.`);
    }

    return false; // Handled
  }

  /**
   * Spawns a physical single-item token on the canvas
   */
  static async createItemTokenOnCanvas(itemData, { x, y, scene = canvas.scene } = {}) {
    if (!scene) scene = canvas.scene;
    if (!scene) return null;

    const grid = canvas.grid?.size || 100;
    const itemName = itemData.name || "Unknown Item";
    const itemImg = itemData.img || "icons/svg/item-bag.svg";

    // Create a temporary synthetic loot actor or find a shared scene loot container
    const actorData = {
      name: itemName,
      type: "loot",
      img: itemImg,
      system: {
        containerType: "generic",
        description: itemData.system?.description || ""
      },
      items: [itemData],
      prototypeToken: {
        name: itemName,
        texture: { src: itemImg, scaleX: 0.8, scaleY: 0.8 },
        width: 0.8,
        height: 0.8,
        displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        flags: {
          crows: {
            isItemToken: true,
            itemData: itemData
          }
        }
      }
    };

    // Create an unlinked Token on the scene directly
    const actor = await Actor.create(actorData, { temporary: false });
    const tokenDoc = await actor.getTokenDocument({
      x: x,
      y: y,
      name: itemName,
      texture: { src: itemImg },
      width: 0.8,
      height: 0.8,
      flags: {
        crows: {
          isItemToken: true,
          itemId: itemData._id
        }
      }
    });

    const [createdToken] = await scene.createEmbeddedDocuments("Token", [tokenDoc.toObject()]);
    return createdToken;
  }

  /**
   * Scatters multiple items across adjacent tiles on the canvas around a coordinate
   */
  static async scatterItemsOnCanvas(items, { x, y, scene = canvas.scene, radius = 1 } = {}) {
    if (!scene) scene = canvas.scene;
    if (!scene || !items || items.length === 0) return [];

    const gridSize = canvas.grid?.size || 100;
    const tokenDocs = [];

    // Spiral / radial offset offsets in grid units
    const offsets = [
      [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [2, 0], [0, 2], [-2, 0], [0, -2],
      [2, 1], [1, 2], [-2, 1], [-1, 2]
    ];

    for (let i = 0; i < items.length; i++) {
      const itemData = items[i];
      const offset = offsets[i % offsets.length];
      const posX = x + (offset[0] * gridSize);
      const posY = y + (offset[1] * gridSize);

      const itemName = itemData.name || "Item";
      const itemImg = itemData.img || "icons/svg/item-bag.svg";

      const actorData = {
        name: itemName,
        type: "loot",
        img: itemImg,
        system: {
          containerType: "generic"
        },
        items: [itemData]
      };

      const actor = await Actor.create(actorData);
      const tokenDoc = await actor.getTokenDocument({
        x: posX,
        y: posY,
        name: itemName,
        texture: { src: itemImg, scaleX: 0.75, scaleY: 0.75 },
        width: 0.75,
        height: 0.75,
        displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
        flags: {
          crows: {
            isItemToken: true
          }
        }
      });
      tokenDocs.push(tokenDoc.toObject());
    }

    return await scene.createEmbeddedDocuments("Token", tokenDocs);
  }

  /**
   * Spawns a container token (e.g. Chest, Dropped Sack, Fallen Corpse) on the canvas
   */
  static async createContainerToken({ name = "Treasure Chest", containerType = "chest", img, items = [], coins = 0, x, y, scene = canvas.scene } = {}) {
    if (!scene) scene = canvas.scene;
    if (!scene) return null;

    let defaultImg = "icons/containers/boxes/chest-wooden-ironbound-brown.webp";
    if (containerType === "corpse") defaultImg = "icons/skills/wounds/skull-blood-trail-red.webp";
    if (containerType === "dropped_pack") defaultImg = "icons/sundries/survival/backpack-worn-leather-brown.webp";

    const actor = await Actor.create({
      name: name,
      type: "loot",
      img: img || defaultImg,
      system: {
        containerType: containerType,
        coins: coins
      },
      items: items
    });

    const tokenDoc = await actor.getTokenDocument({
      x: x,
      y: y,
      name: name,
      texture: { src: img || defaultImg },
      width: 1,
      height: 1,
      displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS
    });

    const [createdToken] = await scene.createEmbeddedDocuments("Token", [tokenDoc.toObject()]);
    return createdToken;
  }
}
