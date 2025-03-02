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
        // Wait for the chat window to load
        await driver.sleep(3000);

        // Ensure chat header is fully loaded before interacting
        await driver.wait(
            until.elementLocated(By.css("header")),
            5000
        );

        // Try to find the username in the chat header
        try {
            let nameElement = await driver.wait(
                until.elementLocated(By.css("span.x1rg5ohu.x13faqbe._aoe.selectable-text.copyable-text")),
                5000
            );
            username = await nameElement.getText();
            logger.info(`Username found in chat header: ${username}`);
            return username;
        } catch (error) {
            logger.warn(`Username not found in chat header for ${phoneNumber}. Trying profile...`);
        }

        // Ensure the chat window is active
        try {
            // Select the active chat window by ensuring it's focused (check for active class or elements)
            let activeChatWindow = await driver.wait(
                until.elementLocated(By.css(".x1n2onr6.xfo81ep.x9f619.x78zum5.x6s0dn4.xh8yej3.x7j6532.x1pl83jw.x1j6awrg.x1te75w5")),
                5000
            );
            await activeChatWindow.click();  // Ensure the chat window is active

            // Wait for the specific Menu button in the chat window
            let chatMenu = await driver.wait(
                until.elementLocated(By.css('button[aria-label="Menu"]')),
                5000
            );
            await chatMenu.click();
            await driver.sleep(2000); // Allow the menu to open

            // Locate and click the "Contact Info" option
            let contactInfo = await driver.wait(
                until.elementLocated(By.css("div[aria-label='Contact info']")),
                5000
            );
            await contactInfo.click();
            await driver.sleep(3000);  // Allow the contact info panel to load

            // Try to locate the username in the profile
            let profileName = await driver.wait(
                until.elementLocated(By.css("span.x1rg5ohu.x13faqbe._aoe.selectable-text.copyable-text")),
                5000
            );
            username = await profileName.getText();
            logger.info(`Extracted username from Contact Info: ${username}`);

            // Close the contact info panel (Escape key)
            await driver.actions().sendKeys(Key.ESCAPE).perform();
        } catch (error) {
            logger.warn(`Could not retrieve username from Contact Info for ${phoneNumber}.`);
        }

    } catch (error) {
        logger.error(`Error fetching username for ${phoneNumber}:`, error);
    }

    return username;
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
