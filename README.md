# Ceptre Web Player

A project by José Daniel Aguilera Mejía and Léonard Wyrsch.

## Introduction

The goal of this project is to explore [Ceptre](https://github.com/chrisamaphone/interactive-lp), a work by [Chris Martens](https://github.com/chrisamaphone) about the generation of interactives stories using linear logic. This is done by creating a web app capable of executing Ceptre code and providing a sample Ceptre file to play with.

### What is Ceptre?

Ceptre is a Language for modeling generative interactive systems using linear logic. It supports:

- Types:

        character : type.
        player : character.
        monster : character.

        location : type.
        village : location.
        river : location.

- Predicates:

        at character location : pred.

- Propositions:

        at player village

- Rules:

        move : at player village -o at player river.

### What are interactive stories?

An interactive story is a story whose outcome can be influenced by the spectator's choices. Role Playing Games (RPGs) are a typical example of an interactive story. At certain points in the game, the player can choose to go East or West, he can choose to save or kill the princess, to burn down the bridge or guard it, to kick the dog or pet it, and so on.

The story may develop differently depending on the choices the player made. He may find the elixir of immortality in the East, or the lost city of Atlantis in the West. He could marry the princess, or be richly rewarded for correcting the right of succession. He could weaken the kingdom's economy by saving it from a barbarian invasion, or risk dooming it by failing to defend the bridge. He could do all this on his own or with the help of his trusty canine companion.

### What is linear logic?

Simply put, linear logic is a type of logic where a proposition is a resource. This is as opposed to classical logic where a proposition is either `true` or `false`. Linear logic allows for situations where a proposition can be present multiple times, and can be modeled using Petri nets.

In classical logic, you could have a proposition called `file is created`, which would be either `true` (the file has been created) or `false` (no file has been created). In linear logic, you could have multiple propositions called `file` which are added to the current state when a file is created, allowing for each of these `file` propositions to be consumed individually.

## How to install

This is a web project, no installation required.

## How to run

Serve the contents of [src](src) with a web server, then visit the server using a web browser.

## How to use

### How to play

Simply make a choice and submit it.

There are multiple ways to make a choice:

- Use the arrow keys to navigate through the choices up or down. If the first choice is selected, pressing up will jump to the last choice. If the last choice is selected, pressing down will jump to the first choice.
- Use the number keys to directly select one of the first 10 choices. `0` will select the 10th choice.
- Use the mouse to directly click on a choice.

There are also multiple ways to submit a choice:

- Use the `Enter` key.
- Click on the `OK` button.
- Double-click on the choice.

Click on the `Restart` button to restart the game.

### How to use custom Ceptre code

1. Click on the `Load Ceptre` button to open the Ceptre code window.
2. Either:
    - Directly type Ceptre code into the "Ceptre code" text field.
    - Use the "Ceptre file" field to choose a `.cep` file to upload. The code will appear in the "Ceptre code" text field and can be edited.
3. Click on the `Load` button to load the Ceptre code. This will automatically close the Ceptre code window.

### Non-standard Ceptre

The Ceptre Web Player is not 100% compliant to Ceptre and includes a few features that are not part of Ceptre. These are:

- Strings. These are used to display custom text. They can be used as a rule name or as an output of a rule:

        "Attack \[C]" : $at player L * at C L * $is_enemy C -o "You killed \[C]."

    Or as a proposition:

        context init = {
            at player village,
            "Your adventure begins!"
        }

- The `#hidden` directive. By default, the Ceptre Web Player will display the name of all rules that have been executed. This may be undesired in some cases and can be prevented using this new directive:

        stage setup = {
            % stage rules here
        }
        #hidden setup.

    The directive must follow after the stage definition.

## Troubleshooting

- Q: I can't see the changes made to CSS, JavaScript, or Ceptre.<br>
A: Clear the cache.
    - Windows: `Ctrl + F5`
    - macOS: `Option + Command + E, Command + R`

## References

- [Description of who is Chris Martens](https://sites.google.com/ncsu.edu/cmartens/home).
- [A short paper about the project](https://www.cs.cmu.edu/~cmartens/ceptre.pdf).
- [A podcast that discusses this project](https://thesearch.space/episodes/3-chris-martens-on-narrative-generation).
- [The complete thesis of the project](https://www.cs.cmu.edu/~cmartens/thesis/thesis.pdf).
