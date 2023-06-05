const CeptreEngine = (() => {
    const MAXIMUM_STAGE_CHANGES = 100;

    function removeIndex(array, index) {
        array.splice(index, 1);
    }

    return class {
        #stages;
        #stageRules;
        #initialStageName;
        #initialState;
        #limit;

        #currentStageName;
        #currentState;
        #currentTransitions;
        #messages = [];

        get state() { return this.#currentState; }
        get stage() { return this.#currentStage; }
        get choices() { return Object.keys(this.#currentTransitions); }
        get messages() { return this.#messages; }

        get #currentStage() { return this.#stages[this.#currentStageName]; }
        get #rules() { return this.stage.rules; }

        initialize({ stages, stageRules, initialStageName, initialState, limit }) {
            this.#stages = stages;
            this.#stageRules = stageRules;
            this.#initialStageName = initialStageName;
            this.#initialState = initialState;
            this.#limit = limit;
        }

        start() {
            this.#messages = [];
            this.#currentStageName = this.#initialStageName;
            this.#currentState = this.#initialState;
            this.#updateTransitions();
        }

        makeChoice(choice) {
            this.#messages = [];
            this.#currentState = this.#currentTransitions[choice].state;
            this.#updateTransitions();
        }

        #getSpecialAtoms(state, detector) {
            return state.map((atom, index) => { return { index: index, atom: atom, arg: atom.args[0]?.arg }; })
                .filter(({ atom }) => detector(atom));
        }

        #popStrings() {
            const atoms = this.#getSpecialAtoms(this.state, CeptreParser.isString);
            atoms.forEach(({ arg }) => this.#messages.push(arg));
            atoms.reverse().forEach(({ index }) => removeIndex(this.state, index));
        }

        #popStage() {
            const stages = this.#getSpecialAtoms(this.state, CeptreParser.isStage);
            if (!stages.length)
                return null;

            const { index, arg } = stages[0];
            removeIndex(this.state, index);
            return arg;
        }

        #updateTransitions() {
            this.#popStrings();
            const nextStage = this.#popStage();
            if (nextStage)
                this.#currentStageName = nextStage;

            this.#currentTransitions = {};
            let transitions = this.#getTransitions(this.#rules);
            const previousStates = {};
            let stageChangeCount = 0;
            while (!transitions.length && ++stageChangeCount < MAXIMUM_STAGE_CHANGES) {
                if (!this.#changeStage(previousStates))
                    return;

                this.#popStrings();
                transitions = this.#getTransitions(this.#rules); // Try again.
            }
            this.#setCurrentTransitions(transitions);
        }

        #setCurrentTransitions(transitions) {
            for (const transition of transitions) {
                const name = this.#getTransitionName(transition);
                this.#currentTransitions[name] = transition;
            }
        }

        #changeStage(previousStates) {
            if (this.#isCycleFound(previousStates))
                return false;

            // Add special atoms.
            this.state.push(CeptreParser.getQuiescenceAtom());
            this.state.push(CeptreParser.getStageAtom(this.#currentStageName));

            // Execute stage rules.
            const transitions = this.#getTransitions(this.#stageRules);
            if (!transitions.length)
                return false;

            this.#currentState = transitions[0].state;

            this.#currentStageName = this.#popStage();
            return true;
        }

        #isCycleFound(previousStates) {
            if (!(this.#currentStageName in previousStates))
                previousStates[this.#currentStageName] = new Set();

            const previousState = previousStates[this.#currentStageName];
            const currentState = JSON.stringify(this.#currentState
                .map(({ name, args }) => [name].concat(args.map(({ arg }) => arg)).join(" "))
                .sort());

            if (previousState.has(currentState))
                return true;

            previousState.add(currentState);
            return false;
        }

        #getArgumentMap({ args }) {
            const result = {};
            for (const { id, arg } of args)
                result[id] = `${arg}`.replaceAll(/_/g, " ");

            return result;
        }

        #getTransitionName(transition) {
            const { name, hasStringName, effects } = transition;
            const argMap = this.#getArgumentMap(transition);
            if (hasStringName) {
                return this.#getStringWithVarNames(name, argMap);
            }

            const args = effects.filter(effect => !CeptreParser.isString(effect))
                .flatMap(({ args }) => args.map(({ arg }) => arg));

            return [name].concat(args.map(arg => argMap[arg])).join(" ");
        }

        #getStringWithVarNames(string, argMap) {
            let result = string;
            new Set([...string.matchAll(/(?<=\\\[)\w+(?=\])/g)].map(([varName]) => varName)).forEach(varName => {
                result = result.replaceAll(`\\[${varName}]`, argMap[varName]);
            });
            return result;
        }

        #getTransitions(rules) {
            const result = [];
            for (const { name, hasStringName, conditions, effects } of rules) {
                const transition = {
                    id: name,
                    name: name,
                    hasStringName: hasStringName,
                    fixedConditions: [],
                    remainingConditions: conditions.map(condition => structuredClone(condition)),
                    effects: effects.map(effect => structuredClone(effect)),
                    args: []
                };

                for (const { arg, type, variable } of conditions.flatMap(({ args }) => args)) {
                    if (!this.#getTransitionArg(arg, transition.args))
                        transition.args.push({ id: arg, arg: arg, type: type, fixed: !variable });
                }
                for (const { arg, type, variable } of effects.flatMap(({ args }) => args)) {
                    if (!this.#getTransitionArg(arg, transition.args))
                        transition.args.push({ id: arg, arg: arg, type: type, fixed: typeof variable === "boolean" ? !variable : variable });
                }

                this.#lockTransition(result, transition, this.state);
            }
            return result;
        }

        #lockTransition(allTransitions, transition, state) {
            //if no remaining conditions to fix, then the transition is possible
            if (!transition.remainingConditions.length) {
                for (const { arg } of transition.effects.flatMap(({ args }) => args)) {
                    const argument = this.#getTransitionArgument(arg, transition.args);
                    if (argument.fixed === 'expr')
                        argument.arg = evaluate(argument.arg, transition.args);
                }
                for (const { name, args } of transition.effects.filter(({ name }) => !isNumPred(name)))
                    state.push({ name: name, args: args.map(({ arg }) => this.#getTransitionArgument(arg, transition.args)) })

                transition.state = state;
                allTransitions.push(transition);
                for (const { atom: { args: [arg] } } of this.#getSpecialAtoms(state, CeptreParser.isString)) {
                    const argMap = this.#getArgumentMap(transition);
                    arg.arg = this.#getStringWithVarNames(arg.arg, argMap);
                }
                return;
            }

            //otherwise, try to fix an element of the remaining conditions
            const currentCondition = transition.remainingConditions.pop();
            if (isNumPred(currentCondition.name)) {
                if (!currentCondition.args.every(({ arg }) => this.#getTransitionArgument(arg, transition.args).fixed)) {
                    transition.remainingConditions.unshift(currentCondition)
                    this.#lockTransition(allTransitions, transition, state)
                } else {
                    const argArray = currentCondition.args.map(({ arg }) => this.#getTransitionArgument(arg, transition.args));
                    if (evaluateNumberPred(currentCondition.name, argArray[0].arg, argArray[1].arg))
                        this.#lockTransition(allTransitions, transition, state)
                }
                return;
            }

            transition.fixedConditions.push(currentCondition);
            for (const atom of state.filter(({ name }) => name === currentCondition.name)) {
                const valid = atom.args.every(({ arg }, i) => {
                    if (!currentCondition.args[i])
                        throw "";
                    const { arg: transitionArg, fixed } = this.#getTransitionArgument(currentCondition.args[i].arg, transition.args);
                    return (arg == transitionArg) || !fixed;
                });
                if (valid) {
                    const newTransition = structuredClone(transition);
                    const newState = state.slice(0);
                    newState.splice(newState.indexOf(atom), 1);
                    for (let i = 0; i < atom.args.length; i++) {
                        const arg = this.#getTransitionArgument(currentCondition.args[i].arg, newTransition.args);
                        arg.arg = atom.args[i].arg;
                        arg.fixed = true;
                        arg.type = atom.args[i].type;
                    }
                    this.#lockTransition(allTransitions, newTransition, newState);
                }
            }
        }

        #getTransitionArg(id, args) {
            return args.find(({ arg }) => arg === id) || false;
        }

        #getTransitionArgument(id, args) {
            return args.find(({ id: argId }) => argId === id) || false;
        }
    };
})();
