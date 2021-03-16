// Snaps building placement to cursor and previews it
function autociv_showBuildingPlacementTerrainSnap(mousePosX, mousePosY)
{
	placementSupport.position = Engine.GetTerrainAtScreenPoint(mousePosX, mousePosY);

	if (placementSupport.mode === "wall")
	{
		// Including only the on-screen towers in the next snap candidate list is sufficient here, since the user is
		// still selecting a starting point (which must necessarily be on-screen). (The update of the snap entities
		// itself happens in the call to updateBuildingPlacementPreview below).
		placementSupport.wallSnapEntitiesIncludeOffscreen = false;
	}
	else
	{
		// Cancel if not enough resources
		if (placementSupport.template && Engine.GuiInterfaceCall("GetNeededResources", { "cost": GetTemplateData(placementSupport.template).cost }))
		{
			placementSupport.Reset();
			inputState = INPUT_NORMAL;
			return true;
		}

		let snapData = Engine.GuiInterfaceCall("GetFoundationSnapData", {
			"template": placementSupport.template,
			"x": placementSupport.position.x,
			"z": placementSupport.position.z,
		});
		if (snapData)
		{
			placementSupport.angle = snapData.angle;
			placementSupport.position.x = snapData.x;
			placementSupport.position.z = snapData.z;
		}
	}

	// Includes an update of the snap entity candidates
	updateBuildingPlacementPreview();

	return;
}


/**
 * Select a building from the construction panel given the current unit(s) selected.
 * @param return - true if buildings exist and is selected to place.
 */
function autociv_placeBuildingByTemplateName(templateName)
{
	// Hack: fast check
	if (Engine.GetGUIObjectByName("unitConstructionPanel").hidden)
		return;

	const cycleTemplates = Engine.ConfigDB_GetValue("user", "autociv.session.building.place." + templateName).match(/[^\W]+/g)
	const templates = [templateName]
	if (cycleTemplates)
		templates.push(...cycleTemplates)

	const self = autociv_placeBuildingByTemplateName
	if (self.state.templateName != templateName || !placementSupport.template)
		self.state.index = -1

	for (let _ = 0; _ < templates.length; _++)
	{
		self.state.index = (self.state.index + 1) % templates.length
		let templateToSelect = templates[self.state.index]

		let index = g_SelectionPanels.Construction.getItems().
			findIndex(templatePath => templatePath.endsWith(templateToSelect));

		if (index == -1)
			continue;

		const unitConstructionButton = self.buttons[index]

		if (!unitConstructionButton ||
			unitConstructionButton.hidden ||
			!unitConstructionButton.enabled ||
			!unitConstructionButton.onPress)
			continue;

		unitConstructionButton.onPress();

		autociv_showBuildingPlacementTerrainSnap(mouseX, mouseY);

		animate(unitConstructionButton).complete().add({
			"onStart": it => it.sprite = "snIconPortraitOver",
			"onComplete": it => it.sprite = "snIconPortrait",
			"duration": 100
		})
		self.state.templateName = templateName

		return true;
	}
}

autociv_placeBuildingByTemplateName.state = {
	"templateName": "",
	"index": -1
}

autociv_placeBuildingByTemplateName.buttons = new Proxy({}, {
	get(target, key)
	{
		return key in target ?
			target[key] :
			target[key] = Engine.GetGUIObjectByName(`unitConstructionButton[${key}]`);
	}
})

function autociv_clearSelectedProductionQueues()
{
	// Hack: fast check
	if (Engine.GetGUIObjectByName("unitQueuePanel").hidden)
		return;

	g_Selection.toList().map(GetEntityState).forEach(entity =>
	{
		if (!entity.production)
			return;

		for (let item of entity.production.queue)
			Engine.PostNetworkCommand({
				"type": "stop-production",
				"entity": entity.id,
				"id": item.id
			});
	});
	return true;
}

var g_autociv_hotkeys_beforeGui = {
	"selection.cancel": function (ev)
	{
		if (autociv_minimapExpand.expanded)
		{
			autociv_minimapExpand.toggle()
			return true
		}
	}
}

var g_autociv_hotkeys = {
	"autociv.session.exit": function (ev)
	{
		for (let name in QuitConfirmationMenu.prototype)
		{
			let quitConfirmation = new QuitConfirmationMenu.prototype[name]();
			if (quitConfirmation.enabled())
				quitConfirmation.display();
		}
		return true;
	},
	"autociv.session.building.autotrain.enable": function (ev)
	{
		autociv_SetAutotrain(true);
		return true;
	},
	"autociv.session.building.autotrain.disable": function (ev)
	{
		autociv_SetAutotrain(false);
		return true;
	},
	"autociv.open.autociv_readme": function (ev)
	{
		autocivCL.Engine.PushGuiPage("page_autociv_readme.xml");
	},
	"autociv.session.production.queue.clear": function (ev)
	{
		autociv_clearSelectedProductionQueues();
		return true;
	},
	"autociv.session.minimap.expand.toggle": function (ev)
	{
		autociv_minimapExpand.toggle();
		return true;
	},
	"selection.woundedonly": function (ev)
	{
		let list = g_Selection.toList();
		g_Selection.reset();
		g_Selection.addList(list.filter(unitFilters.isWounded));
	},
	"autociv.selection.nowoundedonly": function (ev)
	{
		let list = g_Selection.toList();
		g_Selection.reset();
		g_Selection.addList(list.filter(unitFilters.autociv_isNotWounded));
	}
}

var g_autociv_hotkeysPrefixes = {
	"autociv.session.building.place.": function (ev, hotkeyPrefix)
	{
		const buildingTemplateName = ev.hotkey.split(hotkeyPrefix)[1]
		autociv_placeBuildingByTemplateName(buildingTemplateName);
		return true;
	},
	"autociv.session.formation.set.": function (ev, hotkeyPrefix)
	{
		let formationName = ev.hotkey.split(hotkeyPrefix)[1];
		autociv_formation.set(formationName);
		return false;
	},
	"autociv.session.stance.set.": function (ev, hotkeyPrefix)
	{
		let stanceName = ev.hotkey.split(hotkeyPrefix)[1];
		autociv_stance.set(stanceName);
		return false;
	},
	"autociv.session.entity.": function (ev, hotkeyPrefix)
	{
		let expression = ev.hotkey.slice(hotkeyPrefix.length);

		for (let prefix in g_autociv_hotkey_entity)
		{
			const prefixDot = prefix + ".";
			if (expression.startsWith(prefixDot))
				return g_autociv_hotkey_entity[prefix](ev, expression.slice(prefixDot.length));
		}
		return false;
	}
};

autociv_patchApplyN("handleInputBeforeGui", function (target, that, args)
{
	let [ev] = args;
	if ("hotkey" in ev && ev.type == "hotkeydown")
	{
		// Hotkey with normal behaviour
		if (ev.hotkey in g_autociv_hotkeys_beforeGui)
			return !!g_autociv_hotkeys_beforeGui[ev.hotkey](ev);
	}
	return target.apply(that, args);
})

autociv_patchApplyN("handleInputAfterGui", function (target, that, args)
{
	let [ev] = args;
	if ("hotkey" in ev && ev.type == "hotkeydown")
	{
		// Special case hotkeys
		for (let prefix in g_autociv_hotkeysPrefixes)
			if (ev.hotkey.startsWith(prefix))
				return !!g_autociv_hotkeysPrefixes[prefix](ev, prefix);

		// Hotkey with normal behaviour
		if (ev.hotkey in g_autociv_hotkeys)
			return !!g_autociv_hotkeys[ev.hotkey](ev);
	}
	return target.apply(that, args);
})

unitFilters.autociv_isNotWounded = entity =>
{
	let entState = GetEntityState(entity);
	return entState &&
		hasClass(entState, "Unit") &&
		entState.maxHitpoints &&
		100 * entState.hitpoints > entState.maxHitpoints * Engine.ConfigDB_GetValue("user", "gui.session.woundedunithotkeythreshold");
};

autociv_patchApplyN("getPreferredEntities", function (target, that, args)
{
	let [ents] = args;
	if (Engine.HotkeyIsPressed("autociv.selection.nowoundedonly"))
		return ents.filter(unitFilters.autociv_isNotWounded);

	return target.apply(that, args);
})

autociv_patchApplyN("performGroup", function (target, that, args)
{
	let [action, groupId] = args;

	// Garrison selected units inside the building from the control group groupId
	if (action == "breakUp" && Engine.HotkeyIsPressed("autociv.group.button.garrison"))
	{
		let selection = g_Selection.toList();
		if (!selection.length)
			return;

		let ents = Object.keys(g_Groups.groups[groupId].ents);
		if (ents.length != 1)
			return;

		let target = +ents[0];
		let targetState = GetEntityState(target);
		if (!targetState || !targetState.garrisonHolder)
			return;

		Engine.PostNetworkCommand({
			"type": "garrison",
			"entities": selection,
			"target": target,
			"queued": false
		});

		Engine.GuiInterfaceCall("PlaySound", {
			"name": "order_garrison",
			"entity": selection[0]
		});

		return;
	}
	return target.apply(that, args);
})
