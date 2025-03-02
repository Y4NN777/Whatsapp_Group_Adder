require("dotenv").config();
const { Builder, By, until, Key } = require("selenium-webdriver");
const chromedriver = require("chromedriver");  // Import chromedriver
const winston = require("winston");

// Configure Winston Logger
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] : ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "automation.log" }),
    ],
});

// Initialize WebDriver
async function setupDriver() {
    // Ensure chromedriver is used with WebDriver setup
    let driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(new (require('selenium-webdriver/chrome').Options)())
        .build();
    await driver.get("https://web.whatsapp.com");
    logger.info("Opened WhatsApp Web. Scan the QR code.");
    await driver.wait(until.elementLocated(By.css("div.x1hx0egp[aria-label='Search']")), 150000);  // Updated selector
    return driver;
}

// Check if a number is on WhatsApp
async function checkWhatsAppNumber(driver, phoneNumber) {
    try {
        // Wait for the search box and click it
        let searchBox = await driver.wait(
            until.elementLocated(By.css("div[aria-label='Search']")),
            5000
        );
        await searchBox.click();
        await driver.sleep(1000); // Give time for the cursor to be active

        // Type the phone number and press Enter
        await searchBox.sendKeys(phoneNumber, Key.RETURN);
        await driver.sleep(4000); // Wait for search results to load

        // Check if the chat window opened (meaning the user exists)
        try {
            await driver.wait(
                until.elementLocated(By.css("div[role='textbox']")), // Chat input box
                5000
            );
            logger.info(`✅ Number ${phoneNumber} is found on WhatsApp.`);
            return true;
        } catch (chatNotFoundError) {
            logger.warn(`❌ Number ${phoneNumber} not found on WhatsApp.`);
            return false;
        }

    } catch (error) {
        logger.error(`⚠️ Error checking number ${phoneNumber}:`, error);
        return false;
    }
}


// Add contact to WhatsApp Group
async function addToGroup(driver, groupName, phoneNumber) {
    await driver.findElement(By.css("._3uIPm")).click();
    let groupSearch = await driver.findElement(By.css("div.x1hx0egp[aria-label='Search']"));  // Updated selector for search
    await groupSearch.sendKeys(groupName, Key.RETURN);
    await driver.sleep(2000);

    let addParticipantsBtn = await driver.findElement(By.xpath("//span[contains(text(), 'Add participant')]"));
    await addParticipantsBtn.click();

    let inputBox = await driver.findElement(By.css("div.x1hx0egp[aria-label='Search']"));  // Updated selector for input box
    await inputBox.sendKeys(phoneNumber, Key.RETURN);
    await driver.sleep(2000);

    try {
        await driver.findElement(By.xpath("//span[contains(text(), 'Add')]")).click();
        logger.info(`Added ${phoneNumber} to group ${groupName}.`);
    } catch (error) {
        logger.warn(`Failed to add ${phoneNumber} to group ${groupName}.`);
    }
}


// Get WhatsApp Username from Contact Info
async function getWhatsAppUsername(driver, phoneNumber) {
    let username = "Unknown";
    try {
        // Wait for the chat to load
        await driver.sleep(3000);  

        // Try to fetch the username if it's already visible (saved contact)
        try {
            let nameElement = await driver.wait(
                until.elementLocated(By.css("span.x1rg5ohu.x13faqbe._ao3e.selectable-text.copyable-text")),
                5000
            );
            username = await nameElement.getText();
            logger.info(`Username found in chat header: ${username}`);
        } catch (error) {
            logger.warn(`Username not found in chat header for ${phoneNumber}. Trying profile...`);
        }

        // If username is not found, open the profile (three dots menu)
        if (username === "Unknown") {
            // Click on the three vertical dots to open contact options
            let threeDots = await driver.wait(
                until.elementLocated(By.css("button[aria-label='Menu']")),
                5000
            );
            await threeDots.click();
            await driver.sleep(2000); // Let the menu open

            // Locate and click the "Contact Info" option
            let contactInfo = await driver.wait(
                until.elementLocated(By.css("div[aria-label='Contact info']")),
                5000
            );
            await contactInfo.click();
            await driver.sleep(2000);  // Wait for contact info panel to load

            // Now, try to locate the username in the profile
            let profileName = await driver.wait(
                until.elementLocated(By.css("span.x1rg5ohu.x13faqbe._ao3e.selectable-text.copyable-text")),
                5000
            );
            username = await profileName.getText();
            logger.info(`Extracted username from Contact Info: ${username}`);

            // Optionally, close the contact info panel by pressing the Escape key
            await driver.actions().sendKeys(Key.ESCAPE).perform();
        }

        return username;
    } catch (error) {
        logger.error(`Error fetching username for ${phoneNumber}:`, error);
        return username;
    }
}



// Core function
(async function () {
    let driver = await setupDriver();
    const groupName = process.env.WHATSAPP_GROUP_NAME;
    const phoneNumbers = process.env.PHONE_NUMBERS.split(","); // Convert CSV string to an array
    let results = [];

    for (let number of phoneNumbers) {
        if (await checkWhatsAppNumber(driver, number)) {
            let username = await getWhatsAppUsername(driver, number);
            await addToGroup(driver, groupName, number);
            results.push({ username, phone: number });
        }
    }

    logger.info("Final Results:", results);
    // await driver.quit();
})();
