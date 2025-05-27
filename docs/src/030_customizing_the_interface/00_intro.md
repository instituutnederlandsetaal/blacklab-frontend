# Intro

Many parts of the UI of the Corpus Frontend can customized.
Because the Corpus Frontend is a web application, these customizations are mainly done using JavaScript.  

Some settings go deeper, and require changes to how the data is indexed in BlackLab, like the text direction, which fields are available, field data types (numeric, textual, dates, etc.). We'll link to the appropriate BlackLab docs where this is the case.

-----

For the Frontend everything starts in a central config file, `Search.xml`, which serves as a fixed starting point from where you can include your custom scripts and other files. It also contains a few settings that need to be available serverside, such as pagination.  

For most settings we'll try to determine sensible defaults based on your corpus. This means that some customization can be achieved in multiple ways. In these docs we'll primarily explain the Javascript API, with the corresponding BlackLab setting as a footnote, if there is one.

::: tip :information_source: Walkthrough
There's a walkthrough that will take you through the entire process for a simple customization, including creating the configuration files, telling the Frontend where to find them, etc.  
--> [Simple Customization Walkthrough](/tutorials/customize_a_corpus).
:::
::: warning 
User Corpora (corpora uploaded/owned by users) cannot be configured _individually_.  
The reasoning behind this choice is explained below.

:bulb: The `default` customizations will still work!
:::

# User Corpora vs Built-in Corpora

You'll see `user corpora` mentioned in several places in the documentation.  This is a term used to refer to corpora that are uploaded by users, as opposed to those that are added by the administrator. We'll refer to latter as `built-in corpora`.

In BlackLab, they are stored in a different directory, and their `id`s will contain the owner's username. 
For example, a user corpus might be `username:my_corpus`, while a built-in corpus might be `my_corpus`.
Built-in corpora on the other hand will not have a username in their ID.

The main difference between the two is that user corpora cannot be configured individually.
The reasoning for this is that we do not want to allow users to supply arbitrary Javascript, as this could lead to security issues. 
And since users don't have access to files on the server, it would also mean having to create functionality to upload configs and other files, which is not something worth the effort to develop at this time.

It's still possible to customize the display of user corpora, by using the `default` customization directory.  
Configuration works exactly the same as for built-in corpora, but the files will be active for all corpora, including `user corpora`. 
This is a good way to provide a consistent look and feel across all corpora, regardless of who uploaded them.

::: tip
User corpora and built-in corpora are the same under the hood. You can just move a user corpus to the built-in directory (if you have access to the server's files). Doing so is enough to make it available for everyone to see, and will enable customizations.
:::
