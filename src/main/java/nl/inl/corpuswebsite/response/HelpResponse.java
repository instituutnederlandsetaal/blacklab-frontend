package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import nl.inl.corpuswebsite.BaseResponse;

/** Show help page. */
public class HelpResponse extends BaseResponse {

    public HelpResponse() {
        super("help", false);
    }

    @Override
    protected void completeRequest() {
        try (InputStream is = servlet.getHelpPage(corpus)) {
            model.put("content", new String(is.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        displayHtmlTemplate(servlet.getTemplate("contentpage"));
    }

}
