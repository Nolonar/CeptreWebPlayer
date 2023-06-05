const CeptreParser = (() => {
    const typeKeyword = "type";
    const predicateKeyword = "pred";
    const wordSeparator = " ";
    const blockStart = "{";
    const blockEnd = "}";
    const nameSeparator = ":";
    const tensor = " * ";
    const lolli = "-o";
    const noConsume = "$";
    const emptyAtom = "()";
    const directiveMarker = "#";
    const quiescence = "qui";
    const stage = "stage";
    const string = "string";
    const numbers = "numbers";
    const expression = "expr";
    const noLimit = "_";
    const stringMarker = "\\";

    function getLastElement(array) {
        return array.slice(-1)[0];
    }

    function sum(array, condition) {
        return array.reduce((total, value) => total + condition(value), 0);
    }

    return class {
        #types = new Set();
        #customTypes = {};
        #predicates = {};
        #stageRules = [];
        #stages = {};
        #contexts = {};
        #initialState = [];
        #initialStageName = "";
        #limit = 0;
        #strings = [];
        #numberSet = new Set();

        #blockParsers = {
            stage: (name, lines) => this.#stages[name] = this.#parseStage(lines),
            context: (name, lines) => this.#contexts[name] = this.#parseContext(lines)
        };

        #directives = {
            "#interactive": ([stage]) => {
                this.#stages[stage].isInteractive = true;
            },
            "#trace": ([limit, stage, context]) => {
                this.#limit = limit === noLimit ? null : parseInt(limit);
                this.#initialStageName = stage;
                this.#initialState = this.#contexts[context];
            },
            "#hidden": ([stage]) => {
                this.#stages[stage].isHidden = true;
            }
        };

        #specialPredicates = new Set([quiescence, stage]);

        static getQuiescenceAtom() {
            return {
                name: quiescence,
                args: []
            };
        }

        static getStageAtom(stageName) {
            return {
                name: stage,
                args: [{ arg: stageName, type: stage, variable: false }]
            };
        }

        static isStage({ name }) {
            return name === stage;
        }

        static isString({ name, type }) {
            return (name || type) === string;
        }

        parse(ceptre = "") {
            this.#initialize();

            try {
                this.#processLines(this.#getLines(ceptre));
            } catch (e) {
                alert(`Parser error: ${e}`);
                throw e;
            }

            return {
                stageRules: this.#stageRules,
                stages: this.#stages,
                contexts: this.#contexts,
                initialState: this.#initialState,
                initialStageName: this.#initialStageName,
                limit: this.#limit
            };
        }

        #processLines(lines) {
            while (lines.length) {
                const words = lines.shift();
                if (this.#isType(words))
                    this.#parseType(words);
                else if (this.#isPredicate(words))
                    this.#parsePredicate(words);
                else if (this.#isBlock(words))
                    this.#parseBlock(words, lines);
                else if (this.#isRule(words))
                    this.#stageRules.push(this.#parseGlobalRule(words));
                else if (this.#isDirective(words))
                    this.#parseDirectives(words);
                else
                    throw this.#getGenericErrorMessage("Unknown error while parsing Ceptre.", words);
            }
        }

        #initialize() {
            this.#types = new Set();
            this.#customTypes = {
                [stage]: {
                    has: _ => true
                },
                [numbers]: {
                    has: value => {
                        if (!isNaN(parseInt(value)))
                            return true;

                        return evaluatable(value, this.#numberSet) ? expression : false;
                    }
                },
                [string]: {
                    has: this.#isStringReference
                }
            };
            this.#predicates = {};
            this.#stageRules = [];
            this.#stages = {};
            this.#contexts = {};
            this.#initialState = [];
            this.#initialStageName = "";
            this.#strings = [];
        }

        #parseType(words) {
            const [name, separator, type] = words;
            if (separator !== nameSeparator)
                throw this.#getMissingCharErrorMessage(nameSeparator, words);

            if (type === "type") {
                this.#types.add(name);
                if (name !== numbers)
                    this.#customTypes[name] = new Set();

                return;
            }

            const set = this.#customTypes[type];
            if (!set)
                throw this.#getGenericErrorMessage(`Unknown type "${type}"`, words);

            set.add(name);
        }

        #parsePredicate(words) {
            words.pop(); // Ignore "pred"
            const separator = words.pop();
            if (separator !== nameSeparator)
                throw this.#getMissingCharErrorMessage(nameSeparator, words.concat([separator, term]));

            const [name, ...args] = words;
            const unknownTypes = args.filter(arg => !this.#types.has(arg) && !(arg in this.#customTypes));
            if (unknownTypes.length)
                throw this.#getGenericErrorMessage(`Unknown types: [${unknownTypes.join(", ")}]`, words);

            this.#predicates[name] = args;
        }

        #parseBlock(words, lines) {
            const [blockType, name, assignment, start] = words;
            if (assignment !== "=")
                throw this.#getMissingCharErrorMessage("=", words);
            if (start !== blockStart)
                throw this.#getMissingCharErrorMessage(blockStart, words);

            this.#blockParsers[blockType](name, lines);
        }

        #parseStage(lines) {
            const result = { rules: [], isInteractive: false, isHidden: false };
            while (lines.length) {
                const words = lines.shift();
                const isBlockEnd = this.#isBlockEnd(words);
                if (isBlockEnd)
                    words.pop();

                if (words.length)
                    result.rules.push(this.#parseRule(words));

                if (isBlockEnd)
                    return result;
            }
            throw this.#getMissingCharErrorMessage(blockEnd);
        }

        #parseContext(lines) {
            const atoms = [];
            while (lines.length) {
                const words = lines.shift();
                const isBlockEnd = this.#isBlockEnd(words);
                if (isBlockEnd)
                    words.pop();

                if (words.length) {
                    const [name, ...args] = words;
                    if (name in this.#contexts)
                        this.#contexts[name].forEach(atom => atoms.push(atom));
                    else
                        atoms.push(this.#parseAtom(name, args));
                }

                if (isBlockEnd)
                    return atoms;
            }
            throw this.#getMissingCharErrorMessage(blockEnd);
        }

        #parseGlobalRule(words) {
            try {
                return this.#parseRuleBody(words);
            } catch (e) {
                throw this.#getGenericErrorMessage(e, words);
            }
        }

        #parseRule(words) {
            const [ruleName, separator, ...ruleBody] = words;
            if (separator !== nameSeparator)
                throw this.#getMissingCharErrorMessage(nameSeparator, words);

            try {
                const rule = this.#parseRuleBody(ruleBody);
                rule.hasStringName = this.#isStringReference(ruleName);
                rule.name = rule.hasStringName ? this.#getString(ruleName) : ruleName;
                return rule;
            } catch (e) {
                throw this.#getGenericErrorMessage(e, words);
            }
        }

        #parseRuleBody(words) {
            const rule = { name: null, hasStringName: false, conditions: [], effects: [] };
            const ruleParts = words.join(wordSeparator).split(lolli);
            const [conditions,] = ruleParts;
            let [, effects] = ruleParts;
            if (!effects)
                throw this.#getMissingCharErrorMessage(lolli, words);

            this.#numberSet = new Set();
            for (let condition of conditions.split(tensor).map(c => c.trim()).filter(e => e !== emptyAtom)) {
                if (condition.startsWith(noConsume)) {
                    // Condition is not consumed, so we need to add it to the effects.
                    condition = condition.slice(1);
                    effects = [effects, condition].join(tensor);
                }

                const [name, ...args] = condition.split(wordSeparator);
                const atom = this.#parseAtom(name, args);
                atom.args.filter(({ type, variable }) => type === numbers && variable === true).forEach(({ arg }) => this.#numberSet.add(arg));
                rule.conditions.push(atom);
            }
            for (const effect of effects.split(tensor).map(c => c.trim()).filter(e => e !== emptyAtom)) {
                const [name, ...args] = effect.split(wordSeparator);
                rule.effects.push(this.#parseAtom(name, args));
            }
            // Sanity check: strings are not allowed as condition.
            if (rule.conditions.find(CeptreParser.isString))
                throw "Conditions may not contain strings.";

            // Sanity check: at most 1 stage can be consumed, and at most 1 stage can be produced.
            const stagesInConditions = sum(rule.conditions, ({ name }) => name === stage);
            const stagesInEffects = sum(rule.effects, ({ name }) => name === stage);
            if (stagesInConditions > 1 || stagesInEffects > 1)
                throw this.#getGenericErrorMessage(`Rules can't require more than 1 stage (has ${stagesInConditions}) or produce more than 1 stage (has ${stagesInEffects}).`, words);

            // Sanity check: only 1 quiescence atom allowed, and only in conditions.
            const quiescenceInConditions = sum(rule.conditions, ({ name }) => name === quiescence);
            const quiescenceInEffects = sum(rule.effects, ({ name }) => name === quiescence);
            if (quiescenceInConditions > 1 || quiescenceInEffects !== 0)
                throw this.#getGenericErrorMessage(`Rules can't require more than 1 "${quiescence}" atom (has ${quiescenceInConditions}), and can't produce any (has ${quiescenceInEffects}).`, words);

            return rule;
        }

        #parseAtom(name, args) {
            if (this.#isStringReference(name))
                return this.#parseStringAtom(name);

            const predicate = this.#predicates[name] || this.#specialPredicates.has(name);
            if (!predicate)
                throw this.#getGenericErrorMessage(`Unknown predicate "${name}"`, [name].concat(args));

            if (typeof predicate !== "boolean" && args.length !== predicate.length)
                throw this.#getGenericErrorMessage(`Wrong number of arguments. Expected ${predicate.length}, got ${args.length}`, [name].concat(args));

            return {
                name: name,
                args: args.map((arg, i) => {
                    const type = predicate[i] || name;
                    if (!(type in this.#customTypes))
                        throw this.#getGenericErrorMessage(`Invalid predicate`, [name].concat(args));

                    const hasType = this.#customTypes[type].has(arg);
                    const variable = typeof hasType === "boolean" ? !hasType : hasType;
                    if (type === string && !variable)
                        arg = `"${this.#getString(arg)}"`;

                    return { arg: arg, type: type, variable: variable };
                })
            };
        }

        #parseStringAtom(name) {
            return { name: string, args: [{ arg: this.#getString(name), type: string, variable: false }] };
        }

        #parseDirectives(words) {
            const [directive, ...args] = words;
            if (directive in this.#directives) {
                this.#directives[directive](args);
                return;
            }

            console.warn(this.#getGenericErrorMessage(`Unknown directive "${directive}"`, words));
        }

        #filterComments(ceptre) {
            return ceptre
                .split("\n")                            // Split by line.
                .map(line => line.replace(/%.*/g, ""))  // Remove everything preceding the comment character.
                .join("\n");                            // Put lines back together.
        }

        #substituteStrings(ceptre) {
            const controlChar = "\x1b";
            const quoteMark = "\"";
            const doubleBackslashRegex = new RegExp(controlChar + controlChar, "g");
            const backslashRegex = new RegExp(controlChar, "g");
            const quoteMarkRegex = new RegExp(controlChar + quoteMark, "g");
            // Matches a quote mark without preceding backslash, the next quote mark without preceding backslash, and everything in between.
            const stringRegex = new RegExp(`(?<!${controlChar})"[\\s\\S]*?(?<!${controlChar})"`, "g");

            // Properly escaping quote marks requires ignoring double backslashes.
            // This is a multi-step process.
            let result = ceptre
                .replace(/\\/g, controlChar)            // Substitute backslash with control character. This gives meaning to the backslashes.
                .replace(doubleBackslashRegex, "\\");   // Restore double backslashes. This removes the meaning from escaped backslashes.

            // Reverse the matches to ensure that substituting one won't affect the next.
            [...result.matchAll(stringRegex)].reverse().forEach(({ 0: content, index: index }) => {
                result = [
                    result.slice(0, index),                 // Before the match.
                    stringMarker + this.#strings.length,    // Substitute reference.
                    result.slice(index + content.length)    // After the match.
                ].join("");
                const str = content.slice(1, -1)            // Remove leading and trailing quote marks.
                    .replace(quoteMarkRegex, quoteMark)     // Restore quote marks.
                    .replace(backslashRegex, "\\");         // Restore backslashes.

                this.#strings.push(str); // Remember the content.
            });

            return result.replace(backslashRegex, "\\");
        }

        #getLines(ceptre) {
            const c = this.#substituteStrings(ceptre);  // Substitue strings, so they can be re-added later.
            return this.#filterComments(c)              // Remove comments.
                .replace(/\s+/g, wordSeparator)         // Filter new lines and consecutive whitespaces.
                .replace(/[,\.]/g, "\n")                // Replace comma (,) and dot (.) with new line.
                .replace(/(\{|\})/g, "$1\n")            // Add new line after curly braces ({}).
                .split("\n")                            // Split by new line.
                .map(l => l.trim())                     // Remove leading and trailing spaces from each line.
                .filter(l => l)                         // Ignore empty lines.
                .map(this.#getWords);
        }

        #getWords(line) {
            return line
                .replace(/\s*([\:\{\}])\s*/g, " $1 ") // Wrap colon (:) and curly braces ({}) in spaces.
                .split(wordSeparator)                 // Split words by whitespace.
                .filter(w => w);                      // Ignore empty words.
        }

        #isType(words) {
            const type = getLastElement(words);
            return type === typeKeyword
                || this.#types.has(type); // Custom type
        }

        #isPredicate(words) {
            return getLastElement(words) === predicateKeyword;
        }

        #isBlock(words) {
            return words[0] in this.#blockParsers;
        }

        #isStringReference(word) {
            return word.startsWith(stringMarker);
        }

        #isRule(words) {
            // Global rules don't necessarily have names, and therefore might not have name separator.
            // All rules have a lolli, however.
            return !!words.find(word => word.toLowerCase() === lolli);
        }

        #isDirective(words) {
            return words[0].startsWith(directiveMarker);
        }

        #isBlockEnd(words) {
            return getLastElement(words) === blockEnd;
        }

        #getString(stringRef) {
            return this.#strings[parseInt(stringRef.slice(1))];
        }

        #getMissingCharErrorMessage(char, words) {
            return this.#getGenericErrorMessage(`Missing "${char}" while parsing Ceptre.`, words);
        }

        #getGenericErrorMessage(message, words) {
            words = words.map(word => this.#isStringReference(word) ? this.#getString(word) : word).join(wordSeparator);
            return [message, words].join("\n");
        }
    };
})();
