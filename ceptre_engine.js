const CeptreEngine = (() => {
    const MAXIMUM_STAGE_CHANGES = 100;

    function removeIndex(array, index) {
        array.splice(index, 1);
    }

    return class {
        #stages = {};
        #stageRules = [];
        #initialStageName = "";
        #initialState = [];
        #limit = Infinity;

        #currentStageName = "";
        #currentState = [];
        #currentTransitions = {};

        #messageHandler = console.log;

        get state() { return this.#currentState; }
        get stage() { return this.#currentStage; }
        get choices() { return Object.keys(this.#currentTransitions); }

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
            this.#currentStageName = this.#initialStageName;
            this.#updateState(this.#initialState);
            this.#updateTransitions();
        }

        makeChoice(choice) {
            this.#updateState(this.#currentTransitions[choice].state);
            this.#updateTransitions();
        }

        onMessageAdded(callback) {
            this.#messageHandler = callback;
        }

        #updateState(state) {
            this.#currentState = state;
            this.#popStrings().forEach(this.#messageHandler);
        }

        #getSpecialAtoms(state, detector) {
            return state.map((atom, index) => { return { index: index, atom: atom, arg: atom.args[0]?.arg }; })
                .filter(({ atom }) => detector(atom));
        }

        #popStrings() {
            const strings = this.#getSpecialAtoms(this.state, CeptreParser.isString);
            strings.reverse().forEach(({ index }) => removeIndex(this.state, index));
            return strings.map(({ arg }) => arg);
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

            this.#updateState(transitions[0].state);
            this.#currentStageName = this.#popStage();
            return true;
        }

        #isCycleFound(previousStates) {
            if (!(this.#currentStageName in previousStates))
                previousStates[this.#currentStageName] = new Set();

            const previousState = previousStates[this.#currentStageName];
            const currentState = JSON.stringify(this.state
                .map(({ name, args }) => [name].concat(args.map(({ arg }) => arg)).join(" "))
                .sort());

            if (previousState.has(currentState))
                return true;

            previousState.add(currentState);
            return false;
        }

        #getVariableNames({ args }) {
            const result = {};
            for (const { id, arg } of args)
                result[id] = `${arg}`.replaceAll(/_/g, " ");

            return result;
        }

        #getTransitionName(transition) {
            const { name, hasStringName, effects } = transition;
            const varNames = this.#getVariableNames(transition);
            if (hasStringName)
                return this.#getStringWithVarNames(name, varNames);

            const args = effects.filter(effect => !CeptreParser.isString(effect))
                .flatMap(({ args }) => args.map(({ arg }) => arg));

            return [name].concat(args.map(arg => varNames[arg])).join(" ");
        }

        #getStringWithVarNames(string, varNames) {
            let result = string;
            new Set([...string.matchAll(/(?<=\\\[)\w+(?=\])/g)].map(([varName]) => varName)).forEach(varName => {
                result = result.replaceAll(`\\[${varName}]`, varNames[varName]);
            });
            return result;
        }

        #getTransitions(rules) {
            return rules.flatMap(rule => this.#getFinalTransitions(this.#getTransition(rule), this.state));
        }

        #getTransition({ name, hasStringName, conditions, effects }) {
            const args = {};
            conditions.flatMap(({ args }) => args).forEach(({ arg, type, variable }) => {
                if (!(arg in args))
                    args[arg] = { id: arg, arg: arg, type: type, fixed: !variable };
            });
            effects.flatMap(({ args }) => args).forEach(({ arg, type, variable }) => {
                if (!(arg in args))
                    args[arg] = { id: arg, arg: arg, type: type, fixed: typeof variable === "boolean" ? !variable : variable };
            });

            return {
                id: name,
                name: name,
                hasStringName: hasStringName,
                fixedConditions: [],
                remainingConditions: conditions.map(condition => structuredClone(condition)),
                effects: effects.map(effect => structuredClone(effect)),
                args: Object.values(args)
            };
        }

        #getFinalTransitions(transition, state) {
            const argMap = this.#getArgMap(transition);

            //if no remaining conditions to fix, then the transition is possible
            if (!transition.remainingConditions.length)
                return [this.#getFinalTransition(transition, state, argMap)];

            //otherwise, try to fix an element of the remaining conditions
            const currentCondition = transition.remainingConditions.pop();
            if (!isNumPred(currentCondition.name)) {
                transition.fixedConditions.push(currentCondition);
                return state.filter(({ name, args }) => name === currentCondition.name && args.every(({ arg }, i) => {
                    const { arg: transitionArg, fixed } = argMap[currentCondition.args[i].arg];
                    return (arg == transitionArg) || !fixed;
                })).flatMap(atom => {
                    const newTransition = structuredClone(transition);
                    const newArgMap = this.#getArgMap(newTransition);
                    const newState = state.slice(0);
                    newState.splice(newState.indexOf(atom), 1);
                    for (let i = 0; i < atom.args.length; i++) {
                        const arg = newArgMap[currentCondition.args[i].arg];
                        arg.arg = atom.args[i].arg;
                        arg.fixed = true;
                        arg.type = atom.args[i].type;
                    }
                    return this.#getFinalTransitions(newTransition, newState);
                });
            }

            if (!currentCondition.args.every(({ arg }) => argMap[arg].fixed)) {
                transition.remainingConditions.unshift(currentCondition);
                return this.#getFinalTransitions(transition, state);
            }

            const argArray = currentCondition.args.map(({ arg }) => argMap[arg] || false);
            if (evaluateNumberPred(currentCondition.name, argArray[0].arg, argArray[1].arg))
                return this.#getFinalTransitions(transition, state);

            return [];
        }

        #getFinalTransition(transition, state, argMap) {
            transition.effects.flatMap(({ args }) => args)
                .map(({ arg }) => argMap[arg]).filter(({ fixed }) => fixed === "expr")
                .forEach(argument => argument.arg = evaluate(argument.arg, transition.args));

            transition.state = state.concat(transition.effects.filter(({ name }) => !isNumPred(name)).map(({ name, args }) => {
                return { name: name, args: args.map(({ arg }) => argMap[arg] || false) };
            }));

            const varNames = this.#getVariableNames(transition);
            for (const { atom: { args: [arg] } } of this.#getSpecialAtoms(transition.state, CeptreParser.isString)) {
                arg.arg = this.#getStringWithVarNames(arg.arg, varNames);
            }
            return transition;
        }

        #getArgMap({ args }) {
            const argMap = {};
            args.forEach(arg => {
                if (!(arg.id in argMap))
                    argMap[arg.id] = arg;
            });
            return argMap;
        }
    };
})();
