Meal tracking website
==
The purpose here is to get to MVP. The goal is to provide users with the ability to track their recipes, plan meal scheudles for the week, track their previous weeks, and provide breakdowns of the given food plan (given the ingredeints used in a recipe). The idea is for this to be a one-stop-shop for everything food and nutrition related.

In scope
--
- A multi tab interface with two mainthings: a meal library and a weekly planner

The meal planner:
- Should allow you to perofrm CRUD operations on recipes. 
- Should automatically calculate the macro, and vitamin / mineral content on all the ingredients in the recipe (this should allow users to input specific ingredients - for example, if using store bought tortillas)
    - We may want to explore adding a "custom ingredient" section where users can manually input nutrition facts of custom ingredients
    - Additionally, the recipes should allow you to add notes and there should be an optional link section for if there is a recipe online to show you how to cook it
- Should allow you to include custom tags on ingredients so that users can filter recipes based on these tags
- Should have a basic search functionality 
- Should list what kind of meal it is 
- Shoud list number of servings. 


The weekly planner:
- Should list meals Monday - Sunday
- Clicking on the meal in this view should show the custom notes and link 
- Should be able to navigate to previous weeks 
- Should allow a user to perform crud operations on any specific day 
- The weekly planner should encourage that you choose from the recipe list, but should give the option to just include a meal title, description, and link if you dont want to choose a recipe
- Should have an edit button that toggles a new view of the weekly planner. The new viers should look something like this:
    - The list of your recipes should be on the left (along with filtering by meal type and custom tags)
    - The week should be on the right
    - Should have a drag and drop functionality where you can drag the recipe onto the specific day you want.