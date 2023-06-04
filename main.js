const engine = (() => {
    const CEP_FILES = [
        "pkmn",
        "example"
    ].map(value => `cep/${value}.cep`);

    async function get(url) {
        const p = new Promise(resolve => {
            const xhttp = new XMLHttpRequest();
            xhttp.onload = e => resolve(e.target.responseText);
            xhttp.open("GET", url, true);
            xhttp.setRequestHeader("Cache-Control", "no-cache");
            xhttp.send();
        });
        return await p;
    }

    function getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    const parser = new CeptreParser();
    const engine = new CeptreEngine();

    return new class {
        get sampleFiles() { return CEP_FILES; }

        get #choices() { return engine.choices; }
        set #choices(choice) { engine.makeChoice(choice); }

        get #isInteractive() { return engine.stage.isInteractive; }
        get #isHidden() { return engine.stage.isHidden; }

        constructor() {
            this.loadFromFile(this.sampleFiles[0]);
        }

        onload() {
            this.start();
        }

        load(ceptre) {
            engine.initialize(parser.parse(ceptre));
            this.onload();
        }

        async loadFromFile(filename) {
            const code = await get(filename);
            io.setCode(code);
            this.load(code);
        }

        start() {
            console.clear();
            io.clearDisplay();
            io.resetPrompt();
            engine.start();
            this.update();
        }

        update() {
            this.logCurrentState();
            engine.messages.forEach(message => io.print(message));
            if (this.#choices.length) {
                this.#isInteractive ? this.update_playerTurn() : this.update_cpuTurn();
                return;
            }

            io.setPrompt("Game Over");
            this.updatePlayerChoices();
        }

        update_playerTurn() {
            this.updatePlayerChoices();
            io.enable();
        }

        update_cpuTurn() {
            this.submitPlayerChoice(getRandomElement(this.#choices));
        }

        logCurrentState() {
            const stateText = engine.state.map(({ name, args }) => [name].concat(args.map(({ arg }) => arg)).join(" "));
            console.log(["Current state:"].concat(stateText.map(line => "    - " + line)).join("\n"));
        }

        display(message, child) {
            const p = document.createElement("p");
            const span = document.createElement("span");
            span.innerText = message;
            p.appendChild(span);
            if (child)
                p.appendChild(child);

            io.appendToDisplay(p);
        }

        updatePlayerChoices() {
            io.setChoices(this.#choices);
        }

        submitPlayerChoice(playerChoice) {
            io.disable();
            if (!this.#isHidden)
                io.print(`> ${playerChoice}`, this.#isInteractive ? "player-action" : "cpu-action");

            this.#choices = playerChoice;
            this.update();
        }
    }();
})();
