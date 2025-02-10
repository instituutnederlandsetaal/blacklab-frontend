package nl.inl.corpuswebsite.response;

import java.io.IOException;

import nl.inl.corpuswebsite.BaseResponse;

public class IndexResponse extends BaseResponse {

    public IndexResponse() {
        super("main", false);
    }

    @Override
    protected void completeRequest() throws IOException {
        model.put("pageSize", servlet.getWebsiteConfig(corpus).getPageSize().map(Object::toString).orElse(Integer.toString(Integer.MAX_VALUE)));
        model.put("debugInfo", servlet.debugInfo());

        // display template
        displayHtmlTemplate(servlet.getTemplate("main"));
    }
}
