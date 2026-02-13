from flask import Flask, render_template

app = Flask(__name__)       # Creates the app

# Index page
@app.route("/")             # Index page route
def index():                # Returns the index page
    return render_template("index.html")

# About page
@app.route("/about")        # About page route
def about():                # Returns the about page
    return render_template("about.html")

# Design page
@app.route("/design")       # Design page route
def design():               # Returns the design page
    return render_template("design.html")

# Dashboard page
@app.route("/dashboard")    # Dashboard page route
def dashboard():            # Returns the dashboard page
    return render_template("dashboard.html")

# Problem page
@app.route("/problem")      # Problem page route
def problem():              # Returns the problem page
    return render_template("problem.html")      

# Main driving function
if __name__ == "__main__":

    # Run app through port 5000 on local dev
    app.run(debug = True)