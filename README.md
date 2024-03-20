# COMP0101 IEF Project

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)

![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)

![Test Status](https://github.com/GrayNekoBean/if-optimisation-plugins/actions/workflows/node.js.yml/badge.svg)

# Introduction
This project is developed for [Impact Engine Framework](https://github.com/Green-Software-Foundation/if) as part of the models (plugins) for the Impact Engine Framework. This project included three newly introduced models (plugins) for the Impact Engine Framework:

* [**Carbon Advisor**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/carbon-aware-advisor/README.md)
* [**Plotter**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/plotter/README.md)
* [**Right Sizing**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/right-sizing/README.md)

The project is developed by UCL students as part of the COMP0101 module. And this project is supervised and guided by the [Green Software Foundation](https://github.com/Green-Software-Foundation).

# Installation

If you want to install this repository as a local dependency for Impact Engine Framework or other projects, you can install the package via npm:

```bash
npm install @grnsft/if-optimisation-plugins
```

If you want to install this repository as a global package for your node.js environment, you can install the package globally via npm:
```bash
npm install -g @grnsft/if-optimisation-plugins
```

# Run without Installation

## Carbon-Aware-SDK API Setup:

1. **Start the API:**
   - Open a terminal window in the root directory of your project.
   - Execute the script by running:
     ```
     ./api_start.sh
     ```

2. **Open Command Palette:**
   - Press `Ctrl` + `Shift` + `P` to open the Command Palette in your code editor.

3. **Select Project Folder:**
   - Use the Command Palette to select the `carbon-aware-sdk` folder, which should be located in the same directory where you cloned this project.

4. **Run Startup Script:**
   - In the terminal that opens within your selected folder, start the necessary services by running:
     ```
     ./start.sh
     ```
## Execute the Impact Engine within the plugins in this repository

1. **Install NPM Packages:**
   Open a terminal window in the root directory of your project.
   Execute the script by running:
   ```bash
   npm install
   ```

2. **Quick Start**
   There is one shell script in this repository that allows you to run the Impact Engine conveniently with the plugins in this repository. To use this script, you can directly run this script by executing the following command in the terminal:
   ```bash
   ./run.sh <manifest_file_path>
   ```
   Or you can execute this shell script via **NPM script** by running:
   ```bash
   npm run start -- <manifest_file_path>
   ```

   There are some example manifest file in the `examples` folder. You can try to use these manifest files to run the Impact Engine with the plugins in this repository.
