# orCharacter for Roll20 character sheets (orcsCharacter)

***orcs***Character is a Sheet Worker version of the API helper ***oral***Character. It is a self-contained, non-invasive script which significantly simplifies using attributes by implementing JavaScript’s Proxy and Async/Await patterns.  It drops easily into new and existing sheets without affecting your existing code and is non-invasive so you can mix-and-match traditional code with orcsCharacter as you please.  Here’s a short-ish rundown of what orcsCharacter brings to the table:

### Attributes as properties

The simplest example is reading and writing attributes.  Consider the act of healing the player character’s `HP` with their `REC`overy.  Using orcsCharacter, you write this as:

```
	pc.HP = await pc.HP + await pc.REC;
```

Compare the above to the following vanilla code which does the same thing:

```
	getAttrs(["HP", "REC"], (values) => {
        	setAttrs({ "HP": Number(values.HP||0) + Number(values.REC||0);} );
	});
```

Of course, this isn’t an overwhelming example, but it *does* underscore the idea that callbacks, a staple in coding practices of years past, make things more convoluted than their modern `await` alternatives.  Complex tasks can get out of hand quickly.

> _There are a few of noteworthy points to make about the orcsCharacter example above:_
>
> * _orcsCharacter also attempts to detect and manage numeric attributes.  Out of the box, if attributes are “likely” numeric, they are automatically converted to numbers, relieving you from having to write the traditional type-conversion code (e.g. `Numeric(attr||0)`).  If this behavior doesn’t shake your jive, you can easily turn it off and restore the default Roll20 treatment of attributes by adding this to the top of your SheetWorker:_
>
>```
>   pc.preferNumeric(false);
>```
>
> * _The properties exposing character attributes are asynchronous and leverage the Async/Await features of the JavaScript language.  In short, reading and writing properties each interact directly with the Roll20 servers.  The `await` keyword causes code to pause until the server interaction is complete, rather than having to define callback functions. (We make this more efficient in the next section.)_
> * _In addition to accessing attributes as properties, they can also be accessed by name.  For example:_
> ```
>   pc["HP"] = await pc["HP"] + await pc["REC"];
> ```
### Attributes as cached properties

The above “simplest example” follows an “on-demand” philosophy.  Read an attribute?  Go to the server.  Write an attribute?  Go to the server.  Read the same attribute again?  Go to the server.  This is fine for many use cases, but for complex or performance-critical code, orcsCharacter supports bulk reads and writes using `cacheAsync()` which keeps all changes in memory until we are ready to save them all at once with `commitAsyc()`:

```
	var attrbs = await pc.cacheAsync(["HP", "spiritPool", "efficacy"]); //get several attributes at the same time
	attrbs.HP = attrbs.HP + attrbs.efficacy; //use and modify them
	attrbs.spiritPool = attrbs.spiritPool - attrbs.efficacy;
	attrbs.commitAsync(); //save changes together
```

> _Notice that, while we may `await` round trips to the server, we do **not** do so when reading or writing cached attributes._
> 
> _Also note we aren’t `await`ing the final `commitAsync()` call. This is a choice.  We would do so if we needed to ensure all attributes were committed in subsequent logic._

### Simplified Repeating Sections

Repeating Sections are awesome, but they also usher in some of The Most Complicated Code in Sheet Workers today.   orcsCharacter makes working with Repeating Sections markedly more intuitive and expressive.

Here’s an example which searches the PC’s inventory for all disparate “Bags of Gold” and combines their contents into a single bag:

```
	async function combineAllBagsOfGoldCached(){
		var totalGold = 0;
		var inventory = await pc.cacheRepeatingAsync("inventory", ["type", "value"]);
		for (row of inventory) {
			if (row.type != "Bag of Gold") continue;
			totalGold += row.value;
			row.delete();
		}
		if (totalGold > 0) inventory.addNew({type:"Bag of Gold", value:totalGold});
		inventory.commitAsync();
	}
```

The above is straightforward, linear, and readable.  For comparison, I put together a vanilla flavor of the above.  It’s fine.  But I want to throw rocks at it and steal its lunch money:

```
	function combineAllBagsOfGoldVanilla() {
		var totalGold = 0;
		getSectionIDs("repeating_inventory", (ids) => {
			var atrbList = "";
			ids.forEach((id) => {
				if (atrbList != "") atrbList = atrbList + ",";
				atrbList = atrbList + `repeating_inventory_${id}_type`, `repeating_inventory_${id}_value`;
			});
			atrbList = JSON.parse("[" + atrbList + "]");
			getAttrs(atrbList, (values) => {
				ids.forEach(id => {
					if (values[repeating_inventory_${id}_type] != "Bag of Gold") return;
					totalGold  += Number(values[`repeating_inventory_${id}_value`] || 0);
					removeRepeatingRow(`repeating_inventory_${id}`);
				});
				if(totalGold>0){
					var newId = generateRowID();
					setAttrs(JSON.parse({`repeating_inventory_${newId}_type` : "Bag of Gold", `repeating_inventory_${newId}_value` : ${totalGold} }));
				}
			});
		});
	}
```

While it’s true the  version is shorter than the traditional version, that isn’t the biggest benefit here.  The complexity of the vanilla code, including the nested callbacks and amalgamated strings acting as attribute pointers, makes it harder to grok at a glance.  The  version, by comparison, is easier to follow and therefore support.

### Advanced Caching

While the caching functions shown above do a good job pulling lots of attributes down at one time, then subsequentally saving a mess of changes in a single trip to the server, there are a few cases where it helps to optimize this even more.  There are a handful of mutant character sheets, for example, with dozens of repeating sections; managing these individually means dozens of round trips.  `cacheMultipleAsync()` lets you bundle Attributes and Repeating Sections together.  Here's a small example of getting basic attributes and attributes from two different repeating sections at the same time, using arguments which closely resemble what we would pass to `cacheAsync()` and `cacheRepeatingAsync()`:

```
	var sheet = await pc.cacheMultipleAsync(["HP", "REC"], {
		inventory: ["name","type", "value"],
		enchantments:["name","power", "effect"]
	});
```

The object returned is a rollup of our results.  Attributes sit on the `attributes` property and an array of repeating sections is exposed on the `sections `property.  We can use these exactly as if they were returned by our two basic caching functions:

```
	sheet.attributes.HP = sheet.attributes.HP + sheet.attributes.REC;
	sheet.sections.inventory[1].type="Bag of Gold";
```

You might think you could use `cacheAsync()` and `cacheRepeatingAsync()` to populate your own object wrapper, and you'd be right.  But `cacheMultipleAsync() `is more than just syntactic sugar.  In the above example, any server calls which _can_ be bundled together, _are_ bundled together (our specified basic attributes and both repeating sections are retrieved with a single call).  The portions of the Roll20 code which cannot be bundled, (such as getSectionIDs) are parallelized and run simultaneously rather than sequentially.  Finally, once attributes have been modified, the following will save all changes in a single call, regardless of which tracked objects they were made to:

```
	sheet.commitAsync();
```

### Tangential benefits

I believe a side-effect of improved syntaxes, generally, is they often simplify previously difficult tasks almost accidentally.  For example, summing values of a Repeating Section and assigning their total to a character attribute sounds like a trivial undertaking.  orcsCharacter makes this so, not because it provides a specialized `addItUp` function (because it *doesn’t*), but as a consequence of its expressiveness.  You can do this…

```
	var total = 0, inventory = await pc.cacheRepeatingAsync("inventory");
	for (item of inventory) total += item.value;
	pc.HP = total;
```

...or if you favor conciseness over readability, you can do it in a single expression...

```
	pc.HP = (await pc.cacheRepeatingAsync("inventory", ["value"])).reduce((i, v) => i + v.value, 0);
```

 The comparable vanilla code is *significantly* longer, more complex, and resembles a variant of the previous `combineAllBagsOfGoldVanilla()` example.

### A PC by any other name...

"PC" isn't a very unique name in RPGs and the chance for collision with one of your own variable names is high. It's not a problem.  Just copy the content of the `pc` variable before you assign it in your own code:

```
 	var _myPlayerCharacter = pc;
```

Or if you'd rather, you can just rename the `pc` variable to whatever you want by changing the final line of the included script, like so:

```
	var _myPlayerCharacter = orcsCharacter.create();
```

### Installation

Installation is a snap.  If you are not already using the ORCS collection (see below) and want to include this piecemeal, just paste the content from one of the "standalone" files (either "orcsCharacter.standalone.js", or the smaller "orcsCharacter.standalone.min.js") into the top of your SheetWorker code and you're ready.  

### Part of ORCS
This script is part of the [OnyxRing Client Script](https://github.com/onyxring/ORCS-for-Roll20) collection of scripts for the Roll20 platform.  It depends upon the [orcsAsync](https://github.com/onyxring/orcsAsync) module, since JavaScript Promises are a cornerstone of `orcsCharacter`’s expressiveness, and automatically includes it in the "standAlone" versions of this script.  If you are not using the complete version of ORCS, but are instead picking-and-choosing portions of ORCS, the orcsAsync dependency may already be included by virtue of another member script.  In that case, you may choose to include one of the "noDependencies" versions of this script.
