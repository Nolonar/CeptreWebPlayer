const io = (() => {
    const hiddenClass = "hidden";

    const display = document.getElementById("display");
    const prompt = document.getElementById("prompt");
    const select = document.getElementById("input");
    const submit = document.getElementById("submit");
    const restart = document.getElementById("restart");
    const load = document.getElementById("load");
    const ceptreWindow = document.getElementById("ceptre-window");
    const ceptreCode = document.getElementById("ceptre-code");
    const ceptreFile = document.getElementById("ceptre-file");
    const ceptreSubmit = document.getElementById("ceptre-submit");
    const closeButtons = [...document.getElementsByClassName("btn-close")];

    const defaultPrompt = prompt.innerText;

    const keyMap = {
        "Enter": () => submit.click(),
        "ArrowUp": () => io.moveSelectedIndex(-1),
        "ArrowDown": () => io.moveSelectedIndex(1)
    }

    return new class {
        constructor() {
            this.selected = null;

            document.onkeydown = e => {
                if (!ceptreWindow.classList.contains(hiddenClass))
                    return;

                if (e.key in keyMap) {
                    keyMap[e.key]();
                    e.preventDefault();
                    return;
                }

                const index = parseInt(e.key);
                if (isNaN(index))
                    return;

                this.setSelectedIndex((10 + index - 1) % 10);
            };

            select.ondblclick = () => submit.click();

            select.onchange = () => {
                switch (select.selectedOptions.length) {
                    case 0:
                        this.selected = null;
                        break;

                    case 1:
                        this.selected = select.value;
                        break;

                    default:
                        select.value = this.selected;
                        return;
                }
            };

            submit.onclick = () => {
                if (!this.selected)
                    return;

                engine.submitPlayerChoice(this.selected);
            };

            ceptreFile.onchange = () => {
                const file = ceptreFile.files[0];
                if (!file)
                    return;

                ceptreFile.value = null;
                const reader = new FileReader();
                reader.onloadend = () => ceptreCode.value = reader.result;
                reader.readAsText(file);
            };

            restart.onclick = () => engine.start();
            load.onclick = () => ceptreWindow.classList.remove(hiddenClass);
            ceptreSubmit.onclick = () => {
                engine.load(ceptreCode.value);
                ceptreWindow.classList.add(hiddenClass);
            };
            closeButtons.forEach(button => button.onclick = () => ceptreWindow.classList.add(hiddenClass));
        }

        moveSelectedIndex(offset) {
            // No option selected -> select first option.
            if (select.selectedIndex < 0) {
                this.setSelectedIndex(0);
                return;
            }

            const n = select.length;
            this.setSelectedIndex(((select.selectedIndex + offset) % n + n) % n);
        }

        setSelectedIndex(newIndex) {
            select.selectedIndex = newIndex;
            select.onchange();
        }

        setCode(ceptre) {
            ceptreCode.value = ceptre;
        }

        print(message, className) {
            const p = document.createElement("p");
            if (className)
                p.classList.add(className);

            const pre = document.createElement("pre");
            pre.appendChild(document.createTextNode(message));
            p.appendChild(pre);
            this.appendToDisplay(p);
        }

        appendToDisplay(html) {
            display.appendChild(html);

            // Workaround for scrollIntoView not actually scrolling.
            setTimeout(() => {
                html.scrollIntoView({ block: "end", behavior: "smooth", inline: "nearest" });
            }, 0);
        }

        clearDisplay() {
            display.innerHTML = "";
        }

        setPrompt(value) {
            prompt.innerText = value;
        }

        resetPrompt() {
            this.setPrompt(defaultPrompt);
        }

        clearChoices() {
            for (let i = select.options.length; i > 0; i--)
                select.remove(0);
        }

        setChoices(choices) {
            this.clearChoices();
            choices.forEach(choice => this.addChoice(choice));
        }

        addChoice(choice) {
            const option = document.createElement("option");
            option.value = choice;
            option.innerHTML = choice;
            select.appendChild(option);
        }

        disable() {
            this.setSelectedIndex(-1);
            select.disabled = submit.disabled = true;
        }

        enable() {
            this.setSelectedIndex(0);
            select.disabled = submit.disabled = false;
        }
    }();
})();
