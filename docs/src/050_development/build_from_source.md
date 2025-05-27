# Building from source

1. Install **Java 11** or higher. 
2. Install **[Maven](https://maven.apache.org/install.html)** (3.6.0 or higher)
3. Clone the **[BlackLab Frontend repository](https://github.com/instituutnederlandsetaal/blacklab-frontend)**
4. Run `mvn clean package` in the root directory of the repository to build the project. This will create a `.war` file in the `target` directory.  
Maven will automatically download all required dependencies, including Node.js and NPM, so you don't need to install them separately.


