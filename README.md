# COMP0101 IEF Project

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)

![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)

![Test Status](https://github.com/TomasKopunec/comp0101-ief/actions/workflows/node.js.yml/badge.svg)

# Introduction
This project is developed for [Impact Engine Framework](https://github.com/Green-Software-Foundation/if) as part of the models (plugins) for the Impact Engine Framework. This project included three newly introduced models (plugins) for the Impact Engine Framework:

* [**Carbon Advisor**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/carbon-aware-advisor/README.md)
* [**Plotter**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/plotter/README.md)
* [**Right Sizing**](https://github.com/TomasKopunec/comp0101-ief/blob/main/Code/if-optimisation-plugins/src/lib/right-sizing/README.md)

The project is developed by UCL students as part of the COMP0101 module. And this project is supervised and guided by the [Green Software Foundation](https://github.com/Green-Software-Foundation).

# Installation



# Run without Installation

## Local Environment


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

# Running the Dockerized Version

To use the Dockerized version of the application, follow these steps:

1. **Run Docker Container:**
   - In a new terminal window, initiate the Docker container by running:
     ```
     ./docker_run.sh
     ```
   - This process might take up to 3 minutes as the Docker image is being built.

2. **Using the Docker Environment:**
   - Once the Docker container is ready, you'll be automatically placed into the Docker environment's terminal.
   - To execute implementation files located in the `examples` folder, use the following command structure:
     ```
     ./run.sh <file_name>
     ```
     For instance, if you want to run an example file named `new_carbon1.yml`, you would execute:
     ```
     ./run.sh new_carbon1
     ```
**Alternatively build from Dockerfile**
- The Dockerfile  can be find in the parent directory comp0101-ief
- Build and run it using:
   ```
    docker build --no-cache  -t ief_image .
    docker run -it --net=host --name ief_runner ief_image 
  ```
   
