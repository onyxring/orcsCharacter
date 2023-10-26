# orCharacter for Roll20 character sheets (orcsCharacter)
orCharacter for character sheets is a self-contained, non-invasive script which significantly simplifies using attributes by implementing JavaScript’s Proxy and Async/Await patterns.  It drops easily into new and existing sheets without affecting your existing code.  It’s non-invasive so you can mix-and-match traditional code with orCharacter as you please.  Here’s a short-ish rundown of what orCharacter brings to the table:

### Attributes as properties
The simplest example is reading and writing attributes.  Consider the act of healing the player character’s `HP` with their `REC`overy.  Using orCharacter, you write this as:

    pc.HP = await pc.HP + await pc.REC;

Compare the above to the following vanilla code which does the same thing:

	getAttrs(["HP", "REC"], (values) => {
        setAttrs({ "HP": Number(values.HP||0) + Number(values.REC||0);} );
	});

Of course, this isn’t an overwhelming example, but it *does* underscore the idea that callbacks, a staple in coding practices of years past, make things more convoluted than their modern `async` alternatives.  Complex tasks can get out of hand quickly.

_There are a couple of noteworthy points to make about the orCharacter example above:_
* _The properties exposing character attributes are asynchronous and leverage the Async/Await features of the JavaScript language.  In short, reading and writing properties each interact directly with the Roll20 servers.  The `await` keyword causes code to pause until the server interaction is complete, rather than having to define callback functions. (We make this more efficient in the next section.)_
* _orCharacter also attempts to detect and manage numeric attributes.  Out of the box, if attributes are “likely” numeric, they are automatically converted to numbers, relieving you from having to write the traditional type-conversion code (e.g. `Numeric(attr||0)`).  If this behavior doesn’t shake your jive, you can easily turn it off and restore the default Roll20 treatment of attributes by adding this to the top of your SheetWorker:_
```
pc.preferNumeric(false);
```
### Attributes as cached properties
The above “simplest example” follows an “on-demand” philosophy.  Read an attribute?  Go to the server.  Write an attribute?  Go to the server.  Read the same attribute again?  Go to the server.  This is fine for many use cases, but for complex or performance-critical code, orCharacter supports bulk reads and writes using `cacheAsync()` which keeps all changes in memory until we are ready to save them all at once with `commitAsyc()`:

	var attrbs = await pc.cacheAsync(["HP", "spiritPool", "efficacy"]); //get several attributes at the same time
	attrbs.HP = attrbs.HP + attrbs.efficacy; //use and modify them
	attrbs.spiritPool = attrbs.spiritPool - attrbs.efficacy;
	attrbs.commitAsync(); //save changes together

_Notice that, while we may `await` round trips to the server, we do **not** do so when reading or writing cached attributes._ 

_Also note we aren’t `await`ing the final `commitAsync()` call. This is a choice.  We would do so if we needed to ensure all attributes were committed in subsequent logic._

### Simplified Repeating Sections
Repeating Sections are awesome, but they also usher in some of The Most Complicated Code in Sheet Workers today.  orCharacter makes working with Repeating Sections markedly more intuitive and expressive.

Here’s an example which searches the PC’s inventory for all disparate “Bags of Gold” and combines their contents into a single bag:

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

The above is straightforward, linear, and readable.  For comparison, I put together a vanilla flavor of the above.  It’s fine.  But I want to throw rocks at it and steal its lunch money:

	function combineAllBagsOfGoldVanilla() {
		var totalGold = 0;
		getSectionIDs("repeating_inventory", (ids) => {
			var atrbList = "";
			ids.forEach((id) => {
				if (atrbList != "") atrbList = atrbList + ",";
				atrbList = atrbList + `"repeating_inventory_${id}_type", "repeating_inventory_${id}_value"`;
			});
			atrbList = JSON.parse("[" + atrbList + "]");
			getAttrs(atrbList, (values) => {
				ids.forEach(id => {
					if (values[`repeating_inventory_${id}_type`] != "Bag of Gold") return;
					totalGold  += Number(values[`repeating_inventory_${id}_value`] || 0);
					removeRepeatingRow(`repeating_inventory_${id}`);
				});
				if(totalGold>0){
					var newId = generateRowID();
					setAttrs(JSON.parse(`{"repeating_inventory_${newId}_type" : "Bag of Gold", "repeating_inventory_${newId}_value" : ${totalGold} }`));
				}
			});
		});
	}

While it’s true the orCharacter version is shorter than the traditional version, that isn’t the biggest benefit here.  The complexity of the vanilla code, including the nested callbacks and amalgamated strings acting as attribute pointers, makes it harder to grok at a glance.  The orCharacter version, by comparison, is easier to follow and therefore support.

### Tangential benefits
I believe a side-effect of improved syntaxes, generally, is they often simplify previously difficult tasks almost accidentally.  For example, summing values of a Repeating Section and assigning their total to a character attribute sounds like a trivial undertaking.  orCharacter makes this so, not because it provides a specialized `addItUp` function (because it *doesn’t*), but as a consequence of its expressiveness.  You can do this…

    var total = 0, inventory = await pc.cacheRepeatingAsync("inventory"); 
    for (item of inventory) total += item.value;
    pc.HP = total;

...or if you favor conciseness over readability, you can do it in a single expression...

	pc.HP = (await pc.cacheRepeatingAsync("inventory", ["value"])).reduce((i, v) => i + v.value, 0);

 The comparable vanilla code is significantly longer and is expressed as a slightly shorter version of the previous `combineAllBagsOfGoldVanilla()` example.

### Installation 
Installation is a snap.  Just paste the content from one of the "complete" files (either "orcsCharacter.complete.js", or the smaller "orcsCharacter.complete.min.js") into the top of your SheetWorker code and you're ready.  

### A PC by any other name...
"PC" isn't a very unique name in RPGs and the chance for collision with one of your own variable names is high. It's not a problem.  Just copy the content of the `pc` variable before you assign it in your own code:

 	var _myPlayerCharacter = pc; 
 
Or if you'd rather, you can just rename the `pc` variable to whatever you want by changing the final line of the included script, like so:

	var _myPlayerCharacter = orcsCharacter.create();

### “You are a familiar character, sir.”
You might have heard of orCharacter before since I once released an even more beta version of it (a “beta-ier” version?), included in a larger API-dependent framework.  That whole framework was a lot to bite off for a single, targeted feature.  For this discrete release:

* I've peeled `orcsCharacter` (**_this_** client script flavor of orCharacter) out to stand on its own.
* It is for Sheet Workers only; there are no API requirements.
* I’ve refactored the original code to clearly differentiate synchronous from asynchronous functions.  If you have been using the version supplied with the beta release of [ORAL ORCS](https://github.com/onyxring/Roll20OralOrcs), some minor modifications might be required to transition to this revision.  
* The caching/bulk-read-write features described above are brand-spanking new! 
* I’ve included the recently updated [Roll20Async](https://github.com/onyxring/Roll20Async) script since this is a dependency and JavaScript Promises are a cornerstone of `orcsCharacter`’s expressiveness.  

The enhancements from the previous ORAL ORCS version are non-trivial, so it still gets the beta moniker for now; however, testing so far has also been non-trivial so it should be solid enough to try out in development versions of your character sheets.
