import { CeptreEngine } from "./ceptre_engine.js";
import { CeptreParser } from "./ceptre_parser.js";
import { IO } from "./view.js";

const CEP_FILES = [
    "pkmn",
    "example"
];

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

class MainEngine {
    get sampleFiles() { return CEP_FILES.map(value => `cep/${value}.cep`); }

    get #choices() { return engine.choices; }

    get #isInteractive() { return engine.stage.isInteractive; }
    get #isHidden() { return engine.stage.isHidden; }

    start() {
        this.loadFromFile(this.sampleFiles[0]);
        engine.onMessageAdded(io.print.bind(io));
    }

    onload() {
        this.startGame();
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

    async startGame() {
        console.clear();
        io.clearDisplay();
        io.resetPrompt();
        await engine.start();
        this.update();
    }

    update() {
        this.logCurrentState();
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

    async submitPlayerChoice(playerChoice) {
        io.disable();
        if (!this.#isHidden)
            io.print(`> ${playerChoice}`, this.#isInteractive ? "player-action" : "cpu-action");

        await engine.makeChoice(playerChoice);
        this.update();
    }
}

const mainEngine = new MainEngine();
const io = new IO(mainEngine.submitPlayerChoice, mainEngine.startGame, mainEngine.load);
mainEngine.start();
